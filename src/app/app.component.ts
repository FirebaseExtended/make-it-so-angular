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

import { ViewChild, ChangeDetectorRef, Component, signal } from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';
import { CommonModule, AsyncPipe } from '@angular/common';
import {
  FormControl,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
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
import { catchError, map, switchMap, take, tap } from 'rxjs/operators';
import { Observable, forkJoin, from, EMPTY } from 'rxjs';
import { GoogleGenerativeAIFetchError } from '@google/generative-ai';
import { TaskComponent } from './task.component';
import { CheckboximageComponent } from './checkboximage.component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ChangeDetectionStrategy } from '@angular/core';

const HELP_ME_CLEAN = 'Clean this room';
const HELP_ME_PLAN = 'Plan a trip to Greece';

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
    MatProgressSpinnerModule,
    MatIconModule,
    MatInputModule,
    MatNativeDateModule,
    MatSelectModule,
    MatCheckboxModule,
    AsyncPipe,
    TaskComponent,
    CheckboximageComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly formControls = {
    locationSelected: new FormControl(true),
    prompt: new FormControl(HELP_ME_PLAN, {
      nonNullable: true,
      validators: Validators.required,
    }),
  };
  isLoading = signal(false);
  tasks: TaskWithSubtasks[] = [];
  generatedTask?: TaskWithSubtasks;

  @ViewChild('location') locationImage! : CheckboximageComponent;
  @ViewChild('room') roomImage! : CheckboximageComponent;

  locationFile?: File;
  roomFile?: File;

  constructor(
    public taskService: TaskService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadTasks().subscribe();
  }

  async ngAfterViewInit() {
    this.locationFile = await this.locationImage.getFile();
    this.roomFile = await this.roomImage.getFile();
  }

  async onGoClick() {
    await this.generateMaintask();
  }

  onSelectLocation(unused: boolean) {
    this.formControls.prompt.setValue(HELP_ME_PLAN);
    this.formControls.locationSelected.setValue(true);
  }

  onSelectRoom(unused: boolean) {
    this.formControls.prompt.setValue(HELP_ME_CLEAN);
    this.formControls.locationSelected.setValue(false);
  }

  onResetClick() {
    this.generatedTask = undefined;
    this.formControls.prompt.setValue(this.getCurrentPromptPlaceHolder());
  }

  getCurrentPromptPlaceHolder() {
    if (this.formControls.locationSelected.value) {
      return HELP_ME_PLAN;
    } else {
      return HELP_ME_CLEAN;
    }
  }

  handleError(error: any, userMessage: string, duration: number = 3000): void {
    console.error('Error:', error);
    this.snackBar.open(userMessage, 'Close', {
      duration,
    });
  }

  loadTasks(): Observable<TaskWithSubtasks[]> {
    return this.taskService.tasks$.pipe(
      switchMap((tasks: Task[]) =>
      {
        if (tasks.length === 0) {
          return from(this.generateMaintask()).pipe(map((x) => []));
        }
        return forkJoin(
          tasks.map((task: Task) => {
            if (!task.parentId) {
              return this.taskService.loadSubtasks(task.id).pipe(
                take(1),
                map((subtasks: Task[]) => {
                  return { maintask: task, subtasks };
                })
              );
            }
            // tasks$ should only return main tasks, however we recevied one that is not.
            return EMPTY;
          })
        );
      }),
      tap((tasks: TaskWithSubtasks[]) => {
        this.tasks = tasks;
        this.cdr.markForCheck();
      }),
      catchError((error: any) => {
        console.error('Error loading tasks:', error);
        this.snackBar.open('Error loading data', 'Close', {
          duration: 3000,
        });
        return [];
      })
    );
  }

  async generateMaintask(): Promise<void> {
    this.isLoading.set(true);
    try {
      const title = this.formControls.prompt.value;
      const file = this.formControls.locationSelected ? this.locationFile : this.roomFile;
      const generatedSubtasks = await this.taskService.generateSubtasks({
        file,
        title: `Provide a list of tasks to ${title}`,
        existingSubtasks: [],
      });
      const newTaskRef = this.taskService.createTaskRef();
      const maintask: Task = {
        id: newTaskRef.id,
        title: title,
        completed: false,
        owner: this.taskService.currentUser?.uid || this.taskService.localUid!,
        createdTime: Timestamp.fromDate(new Date()),
        priority: 'none',
      };
      const subtasks = generatedSubtasks.subtasks?.map(
        (generatedSubtask: { order: number; title: string }) => {
          return {
            id: this.taskService.createTaskRef().id,
            title: generatedSubtask.title,
            completed: false,
            parentId: newTaskRef.id,
            order: generatedSubtask.order,
            owner: maintask.owner,
            createdTime: maintask.createdTime,
          };
        }
      );
      this.generatedTask = { maintask, subtasks };
    } catch (error) {
      if (error instanceof GoogleGenerativeAIFetchError) {
        if (error.message.indexOf('API key not valid') > 0) {
          this.handleError(
            error,
            'Error loading Gemini API key. Please rerun Terraform with `terraform apply --auto-approve`',
            10000
          );
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

  onSave(): void {
    if (this.generatedTask) {
      this.taskService.addMaintaskWithSubtasks(
        this.generatedTask.maintask,
        this.generatedTask.subtasks
      );
      this.tasks.push(this.generatedTask);
      this.generatedTask = undefined;
    }
  }

  deleteCurrentMainAndSubTasks(task: TaskWithSubtasks): void {
    const index = this.tasks.indexOf(task, 0);
    if (index > -1) {
      this.tasks.splice(index, 1);
    }
    this.taskService.deleteMaintaskAndSubtasks(task.maintask.id);
  }

  async onTasksCompleted(tasks: Task[]) {
    tasks.forEach((task: Task) => {
      this.taskService.updateTask(task);
    });
  }
}
