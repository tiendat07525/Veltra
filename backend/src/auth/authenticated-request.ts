import { Request } from 'express';

// Shape returned by JwtStrategy.validate() and attached to req.user by JwtAuthGuard
export interface AuthenticatedUser {
  id: string;
  _id: string;
  email: string;
  username: string;
  phone?: string;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
