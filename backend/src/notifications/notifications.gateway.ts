import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { UserType } from '../enums/user-type.enum';
import { Employee } from '../employees/entities/employee.entity';

type JwtPayload = {
  sub: string;
  username: string;
  userType: UserType;
  isAdmin: boolean;
};

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
  ) {}

  static roomForEmployee(employeeId: string): string {
    return `emp:${employeeId}`;
  }

  async handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const secret = this.config.get<string>(
        'JWT_SECRET',
        'dev-insecure-change-me',
      );
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, { secret });
      if (payload.userType !== UserType.EMPLOYEE) {
        client.disconnect(true);
        return;
      }
      const emp = await this.employeesRepo.findOne({
        where: { userId: payload.sub },
      });
      if (!emp) {
        client.disconnect(true);
        return;
      }
      await client.join(NotificationsGateway.roomForEmployee(emp.id));
    } catch (err) {
      this.logger.warn('WebSocket auth failed', err);
      client.disconnect(true);
    }
  }

  private extractToken(client: Socket): string | null {
    const fromAuth = client.handshake.auth as { token?: unknown } | undefined;
    if (typeof fromAuth?.token === 'string' && fromAuth.token.trim() !== '') {
      return fromAuth.token.trim();
    }
    const raw = client.handshake.headers.authorization;
    if (typeof raw === 'string' && raw.startsWith('Bearer ')) {
      return raw.slice(7).trim();
    }
    return null;
  }

  emitToEmployee(employeeId: string, event: string, payload: unknown) {
    this.server
      .to(NotificationsGateway.roomForEmployee(employeeId))
      .emit(event, payload);
  }
}
