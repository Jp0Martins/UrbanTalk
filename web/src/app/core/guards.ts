import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from './session.store';

// as permissões de verdade são conferidas pela API; aqui só evita mostrar telas inúteis

export const authGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionStore);
  if (session.user()) return true;
  return inject(Router).createUrlTree(['/entrar'], { queryParams: { volta: state.url } });
};

// telas do cidadão (registrar, minhas reclamações, painel pessoal)
export const citizenGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  if (!session.user()) return router.createUrlTree(['/entrar'], { queryParams: { volta: state.url } });
  if (!session.isCitizen()) return router.createUrlTree(['/admin']);
  return true;
};

export const staffGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  if (!session.user()) return router.createUrlTree(['/entrar'], { queryParams: { volta: state.url, perfil: 'funcionario' } });
  if (!session.isStaff()) return router.createUrlTree(['/painel']);
  return true;
};

export const managerGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  if (!session.user()) return router.createUrlTree(['/entrar'], { queryParams: { volta: state.url, perfil: 'funcionario' } });
  if (!session.isManager()) return router.createUrlTree([session.homePath()]);
  return true;
};

export const guestGuard: CanActivateFn = () => {
  const session = inject(SessionStore);
  return session.user() ? inject(Router).createUrlTree([session.homePath()]) : true;
};
