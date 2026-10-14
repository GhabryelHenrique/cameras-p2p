import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home').then((m) => m.Home) },
  { path: 'studio', loadComponent: () => import('./pages/studio/studio').then((m) => m.Studio) },
  { path: 'join/:hostId', loadComponent: () => import('./pages/join/join').then((m) => m.Join) },
  { path: 'output', loadComponent: () => import('./pages/output/output').then((m) => m.Output) },
  { path: 'output/:hostId', loadComponent: () => import('./pages/output/output').then((m) => m.Output) },
  { path: '**', redirectTo: '' },
];
