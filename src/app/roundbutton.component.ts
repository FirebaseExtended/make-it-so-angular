import {
  EventEmitter,
  input,
  output,
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
  checked = input(false);
  title = input('');
  subtask = input(false);
  disabled = input(false);
  onCheckedChanged = output<boolean>();

  onClick() {
    this.onCheckedChanged.emit(!this.checked);
  }
}
