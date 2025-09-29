import {
SubscribeMessage,
WebSocketGateway,
WebSocketServer,
OnGatewayInit,
OnGatewayConnection,
OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';


@WebSocketGateway({ namespace: '/orders', cors: { origin: '*' } })
export class OrderGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
@WebSocketServer()
server: Server;

private readonly logger = new Logger(OrderGateway.name);

afterInit(server: Server) {
this.logger.log('OrderGateway initialized');
}

handleConnection(client: Socket) {
this.logger.log('Client connected: ' + client.id);
}

handleDisconnect(client: Socket) {
this.logger.log('Client disconnected: ' + client.id);
}

@SubscribeMessage('joinOrder')
handleJoinOrder(client: Socket, payload: { orderId: string }) {
const room = `order:${payload.orderId}`;
client.join(room);
return { ok: true };
}

@SubscribeMessage('joinRestaurant')
handleJoinRestaurant(client: Socket, payload: { restaurantId: string }) {
const room = `restaurant:${payload.restaurantId}`;
client.join(room);
return { ok: true };
}

emitOrderCreated(order: any) {
this.server.to(`restaurant:${order.restaurant_id}`).emit('order.created', order);
this.server.to(`order:${order.id}`).emit('order.created', order);
console.log(order);
}

emitOrderUpdated(order: any) {
this.server.to(`restaurant:${order.restaurant_id}`).emit('order.updated', order);
this.server.to(`order:${order.id}`).emit('order.updated', order);
}

emitOwnerResponse(orderId: string, response: { accepted: boolean; reason?: string }) {
this.server.to(`order:${orderId}`).emit('order.owner_response', response);
  }
}