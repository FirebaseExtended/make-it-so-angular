import {
  EventEmitter,
  Input,
  Output,
  ChangeDetectionStrategy,
  Component,
} from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-checkboximage',
  standalone: true,
  imports: [MatCheckbox, MatIconModule, MatCardModule],
  templateUrl: './checkboximage.component.html',
  styleUrl: './checkboximage.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckboximageComponent {
  @Input() checked = false;
  @Input() src = '';
  @Output() onCheckedChanged = new EventEmitter<boolean>();

  onClick() {
    this.onCheckedChanged.emit(!this.checked);
  }
}
