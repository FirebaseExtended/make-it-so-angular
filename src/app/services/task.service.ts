/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { inject, Injectable } from '@angular/core';
import {
  Auth,
  authState,
  signInAnonymously,
  signOut,
  User,
} from '@angular/fire/auth';
import { getApp } from '@angular/fire/app';

import { Observable, BehaviorSubject, of, firstValueFrom } from 'rxjs';
import {
  doc,
  Firestore,
  setDoc,
  collection,
  deleteDoc,
  collectionData,
  query,
  orderBy,
  Timestamp,
  where,
} from '@angular/fire/firestore';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { environment } from '../../environments/environments';
import { getVertexAI, getGenerativeModel } from 'firebase/vertexai-preview';

type Priority = 'none' | 'low' | 'medium' | 'high';

export type Task = {
  id: string;
  title: string;
  priority?: Priority; // Optional: only for main tasks
  completed: boolean;
  owner: string;
  createdTime: Timestamp;
  order?: number;
  parentId?: string; // Optional: only for subtasks
};

export type TaskWithSubtasks = {
  maintask: Task;
  subtasks: Task[];
};

const MODEL_CONFIG = {
  model: 'gemini-1.5-flash',
  generationConfig: { responseMimeType: 'application/json' },
  systemInstruction: "Keep TODO titles short, ideally within 7 words"
};

@Injectable({
  providedIn: 'root',
})
export class TaskService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  private vertexAI = getVertexAI(getApp());
  // Caveat: the VertexAI model may take a while (~10s) to initialize after your
  // first call to GenerateContent(). You may see a PERMISSION_DENIED error before then.
  private prodModel = getGenerativeModel(this.vertexAI, MODEL_CONFIG);

  private genAI = new GoogleGenerativeAI(environment.gemini_api_key);
  private experimentModel = this.genAI.getGenerativeModel(MODEL_CONFIG);

  user$ = authState(this.auth);
  public tasksSubject = new BehaviorSubject<Task[]>([]);
  tasks$ = this.tasksSubject.asObservable(); // Observable for components to subscribe to
  currentUser: User | null = null;
  public localUid: string | null = null;

  constructor() {
    this.user$.subscribe((user: User | null) => {
      this.currentUser = user;
      if (user) {
        // User is authenticated
        this.localUid = user.uid;
      } else {
        // User is not authenticated
        if (!this.localUid) {
          this.localUid = this.generateLocalUid();
        }
      }
      this.loadTasks().subscribe((tasks) => {
        this.tasksSubject.next(tasks);
      });
    });

    this.login();
  }

  login(): void {
    signInAnonymously(this.auth).catch((error) => {
      console.error('Anonymous login failed:', error);
      // Continue without authentication, relying on the local UID
    });
  }

  logout(): void {
    signOut(this.auth)
      .then(() => {
        console.log('Signed out');
      })
      .catch((error) => console.error('Sign out error:', error));
  }

  private generateLocalUid(): string {
    return 'local-' + uuidv4();
  }

  loadTasks(): Observable<Task[]> {
    const taskQuery = query(
      collection(this.firestore, 'todos'),
      orderBy('createdTime', 'desc')
    );

    return collectionData(taskQuery, { idField: 'id' }) as Observable<Task[]>;
  }

  async loadSubtasks(maintaskId: string): Promise<Observable<Task[]>> {
    const subtaskQuery = query(
      collection(this.firestore, 'todos'),
      where('parentId', '==', maintaskId)
    );
    return await collectionData(subtaskQuery, { idField: 'id' });
  }

  private refreshTasks(): void {
    this.loadTasks().subscribe({
      next: (tasks) => {
        this.tasksSubject.next(tasks);
      },
      error: (error) => {
        console.error('Error fetching tasks:', error);
      },
    });
  }

  createTaskRef(id?: string) {
    const taskCollection = collection(this.firestore, 'todos');
    return id ? doc(taskCollection, id) : doc(taskCollection); // Firestore generates ID if not provided
  }

  async fileToGenerativePart(file: File) {
    const base64EncodedDataPromise = new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(JSON.stringify(reader?.result).split(',')[1]);
      reader.readAsDataURL(file);
    });
    const result = await base64EncodedDataPromise;
    const chew = JSON.stringify(result).slice(1, -3);
    return {
      inlineData: { data: chew, mimeType: file.type },
    } as any;
  }

  async generateMaintask(): Promise<any> {
    const activeTasks = this.tasksSubject
      .getValue()
      .filter((task) => !task.completed && !task.parentId);
    const prompt = `Generate a TODO task that ${
      activeTasks.length > 0
        ? `is different from any of ${JSON.stringify(activeTasks[0].title)}.`
        : `should be feasible in a few days at this time of the year`
    } using this JSON schema: ${JSON.stringify({
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string' },
      },
    })}`;
    try {
      const result = await this.experimentModel.generateContent(prompt);
      return JSON.parse(result.response.text());
    } catch (error) {
      console.error('Failed to generate task', error);
      throw error;
    }
  }

  async generateSubtasks(input: {
    file?: File;
    title: string;
    existingSubtasks: string[]
  }): Promise<any> {
    const { file, title } = input;

    if (!file && !title) {
      return {
        subtasks: [],
      };
    }

    const imagePart = file ? await this.fileToGenerativePart(file) : '';
    const prompt = `Break this task down into smaller pieces ${
      title ? `main task "${title}" ` : ''
    } ${
      file ? 'also consider the image in the input.' : ''
    } excluding these existing subtasks ${input.existingSubtasks.join("\n")}. The output should be in the format:
    ${JSON.stringify({
      subtasks: [
        {
          title: { type: 'string' },
          order: { type: 'int' },
        },
      ],
    })}.`;

    try {
      const result = await this.experimentModel.generateContent(
        [prompt, imagePart].filter(Boolean)
      );
      const response = await result.response.text();
      return JSON.parse(response);
    } catch (error) {
      console.error('Failed to generate subtasks', error);
      throw error;
    }
  }

  async addMaintaskWithSubtasks(
    maintask: Omit<Task, 'id'>,
    subtasks: Omit<Task, 'id'>[]
  ): Promise<void> {
    const userId =
      this.currentUser?.uid || this.localUid || this.generateLocalUid();

    try {
      const maintaskRef = doc(collection(this.firestore, 'todos'));
      const newMaintask: Task = {
        ...maintask,
        id: maintaskRef.id,
        owner: userId,
        createdTime: Timestamp.fromDate(new Date()),
      };
      await setDoc(maintaskRef, newMaintask);

      for (let [index, subtask] of subtasks.entries()) {
        const subtaskRef = doc(collection(this.firestore, 'todos'));
        const newSubtask: Task = {
          ...subtask,
          id: subtaskRef.id,
          owner: userId,
          createdTime: Timestamp.fromDate(new Date()),
          parentId: maintaskRef.id,
          order: index,
        };
        await setDoc(subtaskRef, newSubtask);
      }

      this.refreshTasks();
    } catch (error) {
      console.error('Error adding main task and subtasks to Firestore', error);
    }
  }

  async updateMaintaskAndSubtasks(
    maintask: Task,
    subtasks: Task[]
  ): Promise<void> {
    try {
      const maintaskRef = doc(this.firestore, 'todos', maintask.id);
      await setDoc(maintaskRef, maintask, { merge: true });

      const subtasksObservable = await this.loadSubtasks(maintask.id);
      const existingSubtasks = await firstValueFrom(subtasksObservable);

      const currentSubtaskIds = new Set(subtasks.map((subtask) => subtask.id));

      await Promise.all(
        existingSubtasks.map(async (existingSubtask) => {
          if (!currentSubtaskIds.has(existingSubtask.id)) {
            const subtaskRef = doc(this.firestore, 'todos', existingSubtask.id);
            await deleteDoc(subtaskRef);
          }
        })
      );

      await Promise.all(
        subtasks.map(async (subtask) => {
          const subtaskRef = doc(this.firestore, 'todos', subtask.id);
          await setDoc(subtaskRef, subtask, { merge: true });
        })
      );

      this.refreshTasks();
    } catch (error) {
      console.error('Error updating/deleting tasks and subtasks', error);
      throw error;
    }
  }

  async deleteMaintaskAndSubtasks(maintaskId: string): Promise<void> {
    try {
      const subtasksObservable = await this.loadSubtasks(maintaskId);

      subtasksObservable.subscribe(async (subtasks) => {
        for (let subtask of subtasks) {
          const subtaskRef = doc(this.firestore, 'todos', subtask.id);
          await deleteDoc(subtaskRef);
        }

        const maintaskRef = doc(this.firestore, 'todos', maintaskId);
        await deleteDoc(maintaskRef);

        this.refreshTasks();
      });
    } catch (error) {
      console.error(
        'Error deleting main task and subtasks from Firestore',
        error
      );
    }
  }

  async updateTask(taskData: Task, id: string): Promise<void> {
    const userId =
      this.currentUser?.uid || this.localUid || this.generateLocalUid();

    try {
      const task = { ...taskData, userId: userId };
      await setDoc(doc(this.firestore, 'todos', id), task);
      this.refreshTasks();
    } catch (error) {
      console.error('Error updating task in Firestore', error);
    }
  }

  async deleteTask(id: string): Promise<void> {
    try {
      await deleteDoc(doc(this.firestore, 'todos', id));
      this.refreshTasks();
    } catch (error) {
      console.error('Error deleting task from Firestore', error);
    }
  }
}
