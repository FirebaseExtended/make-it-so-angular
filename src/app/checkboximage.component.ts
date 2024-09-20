import {
  EventEmitter,
  input,
  output,
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
  checked = input(false);
  src = input('');
  onCheckedChanged = output<boolean>();

  onClick() {
    this.onCheckedChanged.emit(!this.checked);
  }

  async getFile() {
    const fetchImage = await fetch(this.src());
    const blob = await fetchImage.blob();
    return new File([blob], 'dot.png', blob);
  }
}
