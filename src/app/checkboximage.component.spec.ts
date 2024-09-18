import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CheckboximageComponent } from './checkboximage.component';

describe('CheckboximageComponent', () => {
  let component: CheckboximageComponent;
  let fixture: ComponentFixture<CheckboximageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CheckboximageComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CheckboximageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
