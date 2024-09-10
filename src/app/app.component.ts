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

import { Component, ElementRef, signal, ViewChild } from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';
import { CommonModule, AsyncPipe } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TaskWithSubtasks, Task, TaskService } from './services/task.service';
import { catchError, take, tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { GoogleGenerativeAIFetchError } from '@google/generative-ai';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatSnackBarModule,
    MatButtonModule,
    MatMenuModule,
    MatChipsModule,
    MatFormFieldModule,
    MatSlideToggleModule,
    MatIconModule,
    MatInputModule,
    MatNativeDateModule,
    MatButtonToggleModule,
    MatSelectModule,
    MatCheckboxModule,
    AsyncPipe,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  taskForm!: FormGroup;
  selectedTaskId: string | null = null;
  tasks: any[] = [];
  subtasks: { task: Task; editing: boolean }[] = [];
  newSubtaskTitle = '';
  imagePreview = signal('');
  isLoading = signal(false);
  @ViewChild('fileInput') fileInput: ElementRef | undefined;

  constructor(
    public taskService: TaskService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar
  ) { }

  ngOnInit(): void {
    this.initForm();
    this.loadTasks().subscribe((tasks) => {
      if (tasks.length === 0) {
        this.generateMaintask();
      }
    });
  }

  initForm(): void {
    this.taskForm = this.fb.group({
      title: ['', Validators.required],
      priority: ['none', Validators.required],
      completed: [false],
    });
  }

  openEditor(task: Task | null = null): void {
    if (task) {
      this.selectedTaskId = task.id;
      this.taskForm.patchValue({
        ...task,
      });

      this.loadSubtasks(task.id);
    } else {
      this.selectedTaskId = null;
    }
  }

  submit(): void {
    if (this.taskForm.invalid) {
      this.handleError('Form invalid', 'Please check all fields');
      return;
    }

    const newTaskRef = this.selectedTaskId
      ? this.taskService.createTaskRef(this.selectedTaskId)
      : this.taskService.createTaskRef(); // Generate Firestore ID only if new

    const maintaskInput: Task = {
      ...this.taskForm.value,
      id: this.selectedTaskId || newTaskRef.id,
      owner: this.taskService.currentUser?.uid || this.taskService.localUid!,
      createdTime: Timestamp.fromDate(new Date()),
    };

    const subtaskInput = this.subtasks.map((subtask, index) => ({
      ...subtask.task,
      parentId: this.selectedTaskId || newTaskRef.id,
      order: index,
    }));

    const existingTaskIndex = this.tasks.findIndex(
      (t) => t.maintask.id === maintaskInput.id
    );

    if (existingTaskIndex !== -1) {
      this.tasks[existingTaskIndex] = {
        maintask: maintaskInput,
        subtasks: subtaskInput,
      };
    } else {
      this.tasks.push({ maintask: maintaskInput, subtasks: subtaskInput });
    }

    this.taskService.tasksSubject.next([...this.tasks]);

    if (this.selectedTaskId) {
      this.taskService.updateMaintaskAndSubtasks(maintaskInput, subtaskInput);
    } else {
      this.taskService.addMaintaskWithSubtasks(maintaskInput, subtaskInput);
    }

    this.resetForm();
  }

  private resetForm(): void {
    this.selectedTaskId = null;
    this.subtasks = [];
    this.taskForm.reset({
      title: '',
      priority: 'none',
      completed: false,
    });
    this.imagePreview.set('');
    this.isLoading.set(false);
  }

  handleError(error: any, userMessage: string, duration: number = 3000): void {
    console.error('Error:', error);
    this.snackBar.open(userMessage, 'Close', {
      duration,
    });
  }

  loadTasks(): Observable<Task[]> {
    return this.taskService.tasks$.pipe(
      tap((tasks: Task[]) => {
        const taskMap = new Map<string, TaskWithSubtasks>();
        tasks.forEach((task: Task) => {
          if (!task.parentId) {
            // It's a main task
            if (taskMap.has(task.id)) {
              taskMap.get(task.id)!.maintask = task;
            } else {
              taskMap.set(task.id, { maintask: task, subtasks: [] });
            }
          } else {
            // It's a subtask
            if (taskMap.has(task.parentId)) {
              taskMap.get(task.parentId)!.subtasks.push(task);
            } else {
              taskMap.set(task.parentId, {
                maintask: {} as Task,
                subtasks: [task],
              });
            }
          }
        });

        this.tasks = Array.from(taskMap.values());
      }),
      catchError((error: any) => {
        console.error('Error loading tasks:', error);
        this.snackBar.open('Error loading data', 'Close', {
          duration: 3000,
        });
        return [];
      }),
    );
  }

  loadSubtasks(maintaskId: string): void {
    this.taskService
      .loadSubtasks(maintaskId)
      .then((subtasksObservable: any) => {
        subtasksObservable.pipe(take(1)).subscribe({
          next: (subtasks: any) => {
            this.subtasks = subtasks.map((task: any) => ({
              task,
              editing: false,
            }));
          },
          error: (error: any) => {
            if (error.message.indexOf('Missing or insufficient permissions') >= 0) {
              this.handleError(error, 'Check Firestore permissions in Firebase Console at: https://console.firebase.google.com/project/_/firestore/databases/-default-/rules', 10000);
            } else {
              this.handleError(error, 'Failed to load subtasks.');
            }
          },
        });
      })
      .catch((error: any) => {
        console.error('Error resolving subtasks observable:', error);
        this.snackBar.open('Error resolving subtasks observable', 'Close', {
          duration: 3000,
        });
      });
  }

  async handleFileInput(event: any): Promise<void> {
    const file = event.target.files[0] as File | null;
    if (!file) {
      this.handleError(null, 'File not found');
      return;
    }

    const fileSizeMB = file.size / (1024 * 1024); // Convert bytes to MB
    if (fileSizeMB > 20) {
      this.handleError(
        null,
        'File size exceeds 20MB limit. Please select a smaller file.'
      );
      return;
    }
    this.isLoading.set(true);
    try {
      await this.displayImagePreview(file);
      const existingSubtasks = this.subtasks.map(t => t.task.title);
      const title = this.taskForm.get('title')?.value || '';
      const generatedSubtasks = await this.taskService.generateSubtasks({
        file,
        title,
        existingSubtasks,
      });
      this.addSubtasksToList(generatedSubtasks.subtasks);
    } catch (error) {
      if (error instanceof GoogleGenerativeAIFetchError) {
        this.handleError(error, error.message);
      } else {
        this.handleError(error, 'Failed to generate subtasks from image.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async handleTitleInput(): Promise<void> {
    const title = this.taskForm.get('title')?.value;

    if (!title) {
      this.handleError(
        'Empty title',
        'Please enter a title for the main task first.'
      );
      return;
    }
    this.isLoading.set(true);
    const existingSubtasks = this.subtasks.map(t => t.task.title);
    try {
      const generatedSubtasks = await this.taskService.generateSubtasks({
        title,
        existingSubtasks
      });
      this.addSubtasksToList(generatedSubtasks.subtasks);
    } catch (error) {
      if (error instanceof GoogleGenerativeAIFetchError) {
        this.handleError(error, error.message);
      } else {
        this.handleError(error, 'Failed to generate subtasks from title.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  private addSubtasksToList(subtasks: any[]): void {
    const owner =
      this.taskService.currentUser?.uid || this.taskService.localUid!;
    const currentTime = Timestamp.fromDate(new Date());

    const newSubtasks = subtasks.map((subtask: any, index: number) => ({
      task: {
        id: this.taskService.createTaskRef().id,
        title: subtask.title,
        completed: false,
        parentId: this.selectedTaskId || '', // Placeholder, to be set on save
        order: this.subtasks.length + index,
        owner: owner,
        createdTime: currentTime,
      },
      editing: false,
    }));

    this.subtasks = this.subtasks.concat(newSubtasks);
  }

  async generateMaintask(): Promise<void> {
    this.isLoading.set(true);
    try {
      const generatedTask = await this.taskService.generateMaintask();
      const newTaskRef = this.taskService.createTaskRef();
      const newTask: Task = {
        id: newTaskRef.id,
        title: generatedTask.title,
        completed: false,
        owner: this.taskService.currentUser?.uid || this.taskService.localUid!,
        createdTime: Timestamp.fromDate(new Date()),
        priority: generatedTask.priority
          ? generatedTask.priority.toLowerCase()
          : 'none',
      };

      this.openEditor(newTask);
    } catch (error) {
      if (error instanceof GoogleGenerativeAIFetchError) {
        if (error.message.indexOf('API key not valid') > 0) {
          this.handleError(error, 'Error loading Gemini API key. Please rerun Terraform with `terraform apply --auto-approve`', 10000);
        } else {
          this.handleError(error, error.message);
        }
      } else {
        this.handleError(error, 'Failed to generate main task.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  completeTask(task: Task): void {
    const updated = { ...task, completed: !task.completed };

    if (!task.parentId) {
      const maintaskIndex = this.tasks.findIndex(
        (t) => t.maintask.id === task.id
      );
      if (maintaskIndex !== -1) {
        this.tasks[maintaskIndex].maintask = updated;
      }
    } else {
      const subtaskIndex = this.subtasks.findIndex(
        (st) => st.task.id === task.id
      );
      if (subtaskIndex !== -1) {
        this.subtasks[subtaskIndex].task = updated;
      }
    }

    this.taskService
      .updateTask(updated, updated.id)
      .then(() => {
        console.log('Task completion status updated in Firestore');
      })
      .catch((error: any) => {
        console.error(
          'Error updating task completion status in Firestore',
          error
        );
        this.snackBar.open('Error updating task', 'Close', {
          duration: 3000,
        });
      });
  }

  addSubtask(): void {
    if (!this.newSubtaskTitle.trim()) {
      this.handleError('Empty title', 'Please populate title');
      return;
    }

    const newSubtask: Task = {
      id: this.taskService.createTaskRef().id,
      title: this.newSubtaskTitle.trim(),
      completed: false,
      parentId: this.selectedTaskId || '',
      order: this.subtasks.length,
      owner: this.taskService.currentUser?.uid || this.taskService.localUid!,
      createdTime: Timestamp.fromDate(new Date()),
    };

    this.subtasks.push({ task: newSubtask, editing: false });
    this.newSubtaskTitle = '';
  }

  moveSubtaskOrder(
    subtask: { task: Task; editing: boolean },
    direction: 'up' | 'down'
  ): void {
    const index = this.subtasks.findIndex(
      (st) => st.task.id === subtask.task.id
    );

    if (direction === 'up' && index > 0) {
      [this.subtasks[index], this.subtasks[index - 1]] = [
        this.subtasks[index - 1],
        this.subtasks[index],
      ];
    } else if (direction === 'down' && index < this.subtasks.length - 1) {
      [this.subtasks[index], this.subtasks[index + 1]] = [
        this.subtasks[index + 1],
        this.subtasks[index],
      ];
    }

    this.subtasks.forEach((st, i) => {
      st.task.order = i;
    });
  }

  deleteCurrentMainAndSubTasks(): void {
    if (this.selectedTaskId) {
      this.taskService.deleteMaintaskAndSubtasks(this.selectedTaskId);
      this.resetForm();
    }
  }

  deleteSubtask(subtask: { task: Task; editing: boolean }): void {
    this.subtasks = this.subtasks.filter(
      (st) => st.task.id !== subtask.task.id
    );
  }

  async onFileDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const file = event.dataTransfer?.files[0] as File | null;

    if (file) {
      const inputEvent = { target: { files: [file] } } as any;
      await this.handleFileInput(inputEvent);
    } else {
      this.handleError(null, 'No file detected in the drop event.');
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  private async displayImagePreview(file: File): Promise<void> {
    const reader = new FileReader();
    reader.onload = () => {
      this.imagePreview.set(reader.result as string);
    };
    reader.readAsDataURL(file);
  }
}
