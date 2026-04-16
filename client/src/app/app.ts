import { Component } from '@angular/core';
import { Chat } from './chat/chat';
import { Documents } from './documents/documents';

@Component({
  selector: 'app-root',
  imports: [Chat, Documents],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
