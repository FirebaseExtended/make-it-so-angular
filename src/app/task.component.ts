import {
  EventEmitter,
  Input,
  Output,
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
  @Input() task!: TaskWithSubtasks;

  @Input() canDelete: boolean = true;
  @Input() showGeneratedWithGemini = false;
  @Output() onDelete = new EventEmitter<TaskWithSubtasks>();
  @Output() onTaskCompletedToggle = new EventEmitter<Task>();

  onCheckedChanged(newValue: boolean, task: Task) {
    task.completed = newValue;
  }

  onCheckedChangeMainTask(newValue: boolean, task: TaskWithSubtasks) {
    task.maintask.completed = newValue;
    task.subtasks.forEach((subtask: Task) => {
      subtask.completed = newValue;
    });
  }

  onDeleteClicked() {
    this.onDelete.emit(this.task);
  }
}
