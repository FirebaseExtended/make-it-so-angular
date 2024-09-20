import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoundbuttonComponent } from './roundbutton.component';

describe('RoundbuttonComponent', () => {
  let component: RoundbuttonComponent;
  let fixture: ComponentFixture<RoundbuttonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoundbuttonComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RoundbuttonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
