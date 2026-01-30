// notification-service/src/modules/notifications/dto/user-registered.event.ts

export class UserRegisteredEvent {
  user_id: string;
  email: string;
  created_at: Date;
}