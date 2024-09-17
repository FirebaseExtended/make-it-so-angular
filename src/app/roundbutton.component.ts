import {
  EventEmitter,
  Input,
  Output,
  ChangeDetectionStrategy,
  Component,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-roundbutton',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './roundbutton.component.html',
  styleUrl: './roundbutton.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoundbuttonComponent {
  @Input() checked = false;
  @Input() title = '';
  @Input() subtask = false;
  @Output() onCheckedChanged = new EventEmitter<boolean>();

  onClick() {
    this.onCheckedChanged.emit(!this.checked);
  }
}
