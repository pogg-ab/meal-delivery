export class OrderCreatedEvent {
  id: string; // Order ID
  ownerId: string; // The ID of the restaurant owner
  total_amount: number;
  currency: string;
}