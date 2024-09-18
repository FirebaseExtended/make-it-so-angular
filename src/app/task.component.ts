import {
  EventEmitter,
  signal,
  input,
  output,
  ChangeDetectionStrategy,
  Component,
} from '@angular/core';
import {
  MatCard,
  MatCardContent,
  MatCardHeader,
  MatCardTitle,
} from '@angular/material/card';
import { Task, TaskWithSubtasks } from './services/task.service';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { RoundbuttonComponent } from './roundbutton.component';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  selector: 'app-task',
  standalone: true,
  imports: [
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatCardContent,
    MatCheckbox,
    MatButtonToggleModule,
    MatIconModule,
    MatButtonModule,
    RoundbuttonComponent,
    MatDividerModule,
  ],
  templateUrl: './task.component.html',
  styleUrl: './task.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskComponent {
  task = input(undefined as TaskWithSubtasks | undefined);
  canDelete = input(true);
  showGeneratedWithGemini = input(false);

  onDelete = output<TaskWithSubtasks>();
  onTasksCompletedToggle = output<Task[]>();

  onCheckedChanged(subtask: Task) {
    subtask.completed = !subtask.completed;
    this.onTasksCompletedToggle.emit([subtask]);
  }

  onCheckedChangeMainTask(task?: TaskWithSubtasks) {
    if (task) {
      task.subtasks.forEach((subtask: Task) => {
        subtask.completed = !task.maintask.completed;
      });
      task.maintask.completed = !task.maintask.completed;
      this.onTasksCompletedToggle.emit([task.maintask, ...task.subtasks]);
    }
  }

  onDeleteClicked() {
    const task = this.task();
    if (task) {
      this.onDelete.emit(task);
    }
  }
}
