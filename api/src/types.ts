// user = cliente; staff = funcionário; admin = funcionário que também gerencia status e equipe
export type Role = 'user' | 'staff' | 'admin';
export const ROLES: Role[] = ['user', 'staff', 'admin'];
export const isStaffRole = (r: Role | undefined) => r === 'staff' || r === 'admin';

// status agora vêm da tabela statuses; o slug identifica cada um
export type Status = string;

// cores semânticas aceitas para status (o front e o PDF traduzem para tons do design)
export const STATUS_COLORS = ['ambar', 'azul', 'verde', 'violeta', 'petroleo', 'laranja', 'cinza', 'vermelho'] as const;
export type StatusColor = (typeof STATUS_COLORS)[number];

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}
