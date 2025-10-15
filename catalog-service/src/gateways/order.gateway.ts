// import {
// SubscribeMessage,
// WebSocketGateway,
// WebSocketServer,
// OnGatewayInit,
// OnGatewayConnection,
// OnGatewayDisconnect,
// } from '@nestjs/websockets';
// import { Server, Socket } from 'socket.io';
// import { Logger } from '@nestjs/common';


// @WebSocketGateway({ namespace: '/orders', cors: { origin: '*' } })
// export class OrderGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
// @WebSocketServer()
// server: Server;

// private readonly logger = new Logger(OrderGateway.name);

// afterInit(server: Server) {
// this.logger.log('OrderGateway initialized');
// }

// handleConnection(client: Socket) {
// this.logger.log('Client connected: ' + client.id);
// }

// handleDisconnect(client: Socket) {
// this.logger.log('Client disconnected: ' + client.id);
// }

// @SubscribeMessage('joinOrder')
// handleJoinOrder(client: Socket, payload: { orderId: string }) {
// const room = `order:${payload.orderId}`;
// client.join(room);
// return { ok: true };
// }

// @SubscribeMessage('joinRestaurant')
// handleJoinRestaurant(client: Socket, payload: { restaurantId: string }) {
// const room = `restaurant:${payload.restaurantId}`;
// client.join(room);
// return { ok: true };
// }

// emitOrderCreated(order: any) {
// this.server.to(`restaurant:${order.restaurant_id}`).emit('order.created', order);
// this.server.to(`order:${order.id}`).emit('order.created', order);
// console.log(order);
// }

// emitOrderUpdated(order: any) {
// this.server.to(`restaurant:${order.restaurant_id}`).emit('order.updated', order);
// this.server.to(`order:${order.id}`).emit('order.updated', order);
// }

// emitOwnerResponse(orderId: string, response: { accepted: boolean; reason?: string }) {
// this.server.to(`order:${orderId}`).emit('order.owner_response', response);
//   }

//  emitPickupCreated(order: any, pickup: any) {
//   // full pickup to order room (customer)
//   this.server.to(`order:${order.id}`).emit('order.pickup_created', {
//     order_id: order.id,
//     pickup_token: pickup.pickup_token,
//     pickup_code: pickup.pickup_code, // full code for customer's room
//     expires_at: pickup.expires_at,
//   }); 
//  }

//  // masked code for restaurant (don't reveal full code).
//   const maskedCode = String(pickup.pickup_code).replace(/\d(?=\d{2})/g, '*'); // show last 2 digits
//   this.server.to(`restaurant:${order.restaurant_id}`).emit('order.pickup_created', {
//     order_id: order.id,
//     pickup_code_masked: maskedCode,
//     expires_at: pickup.expires_at,
//   });
// }


// import {
//   SubscribeMessage,
//   WebSocketGateway,
//   WebSocketServer,
//   OnGatewayInit,
//   OnGatewayConnection,
//   OnGatewayDisconnect,
// } from '@nestjs/websockets';
// import { Server, Socket } from 'socket.io';
// import { Logger } from '@nestjs/common';

// @WebSocketGateway({ namespace: '/orders', cors: { origin: '*' } })
// export class OrderGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
//   @WebSocketServer()
//   server: Server;

//   private readonly logger = new Logger(OrderGateway.name);

//   afterInit(server: Server) {
//     this.logger.log('OrderGateway initialized');
//   }

//   handleConnection(client: Socket) {
//     this.logger.log('Client connected: ' + client.id);
//   }

//   handleDisconnect(client: Socket) {
//     this.logger.log('Client disconnected: ' + client.id);
//   }

//   /**
//    * Join an order room (useful for customers viewing a specific order)
//    * payload: { orderId: string }
//    */
//   @SubscribeMessage('joinOrder')
//   handleJoinOrder(client: Socket, payload: { orderId: string }) {
//     const room = `order:${payload.orderId}`;
//     client.join(room);
//     this.logger.log(`Client ${client.id} joined room ${room}`);
//     return { ok: true };
//   }

//   /**
//    * Join a restaurant room (restaurant staff)
//    * payload: { restaurantId: string }
//    */
//   @SubscribeMessage('joinRestaurant')
//   handleJoinRestaurant(client: Socket, payload: { restaurantId: string }) {
//     const room = `restaurant:${payload.restaurantId}`;
//     client.join(room);
//     this.logger.log(`Client ${client.id} joined room ${room}`);
//     return { ok: true };
//   }

//   /**
//    * Optional: join a customer-specific room for private notifications (recommended).
//    * payload: { customerId: string }
//    */
//   @SubscribeMessage('joinCustomer')
//   handleJoinCustomer(client: Socket, payload: { customerId: string }) {
//     const room = `customer:${payload.customerId}`;
//     client.join(room);
//     this.logger.log(`Client ${client.id} joined room ${room}`);
//     return { ok: true };
//   }

//   emitOrderCreated(order: any) {
//     try {
//       this.server.to(`restaurant:${order.restaurant_id}`).emit('order.created', order);
//       this.server.to(`order:${order.id}`).emit('order.created', order);
//       this.logger.log(`order.created emitted for order ${order.id}`);
//     } catch (err) {
//       this.logger.warn('Failed to emit order.created', err as any);
//     }
//   }

//   emitOrderUpdated(order: any) {
//     try {
//       this.server.to(`restaurant:${order.restaurant_id}`).emit('order.updated', order);
//       this.server.to(`order:${order.id}`).emit('order.updated', order);
//       this.logger.log(`order.updated emitted for order ${order.id}`);
//     } catch (err) {
//       this.logger.warn('Failed to emit order.updated', err as any);
//     }
//   }

//   emitOwnerResponse(orderId: string, response: { accepted: boolean; reason?: string }) {
//     try {
//       this.server.to(`order:${orderId}`).emit('order.owner_response', response);
//       this.logger.log(`order.owner_response emitted for order ${orderId}`);
//     } catch (err) {
//       this.logger.warn('Failed to emit owner_response', err as any);
//     }
//   }

//   /**
//    * Emit pickup creation:
//    * - Full pickup info to the order room (customer or whoever joined the order room).
//    * - Masked code to the restaurant room.
//    *
//    * pickup is expected to include:
//    * { pickup_token: string, pickup_code: string | number, expires_at: string|Date }
//    */
//   emitPickupCreated(order: any, pickup: { pickup_token?: string; pickup_code?: string | number; expires_at?: any }) {
//     try {
//       // Full payload for order (customer)
//       this.server
//         .to(`order:${order.id}`)
//         .emit('order.pickup_created', {
//           order_id: order.id,
//           pickup_token: pickup.pickup_token ?? null,
//           pickup_code: pickup.pickup_code ?? '',
//           expires_at: pickup.expires_at ?? null,
//         });

//       // Create a masked representation for the restaurant: reveal only last 2 characters/digits
//       const rawCode = String(pickup.pickup_code ?? '');
//       let maskedCode = '';
//       if (rawCode.length <= 2) {
//         maskedCode = '*'.repeat(Math.max(1, rawCode.length));
//       } else {
//         const lastTwo = rawCode.slice(-2);
//         maskedCode = `${'*'.repeat(Math.max(0, rawCode.length - 2))}${lastTwo}`;
//       }

//       // Emit masked version to restaurant room
//       this.server
//         .to(`restaurant:${order.restaurant_id}`)
//         .emit('order.pickup_created', {
//           order_id: order.id,
//           pickup_code_masked: maskedCode,
//           expires_at: pickup.expires_at ?? null,
//         });

//       this.logger.log(`order.pickup_created emitted for order ${order.id} (masked for restaurant)`);
//     } catch (err) {
//       this.logger.warn('Failed to emit pickup_created', err as any);
//     }
//   }
// }




// src/gateways/order.gateway.ts
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

interface OrderSummary {
  id: string;
  restaurant_id: string;
  // add other lightweight fields you want to broadcast here
}

interface PickupSummary {
  pickup_token?: string;
  pickup_code?: string | number;
  expires_at?: string | Date | null;
}

/**
 * Orders Websocket Gateway
 * Namespace: /orders
 */
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

  /**
   * Join an order room (customers)
   * payload: { orderId: string }
   */
  @SubscribeMessage('joinOrder')
  handleJoinOrder(client: Socket, payload: { orderId: string }) {
    if (!payload?.orderId) return { error: 'orderId required' };
    const room = `order:${payload.orderId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined room ${room}`);
    return { ok: true };
  }

  /**
   * Join a restaurant room (restaurant staff)
   * payload: { restaurantId: string }
   */
  @SubscribeMessage('joinRestaurant')
  handleJoinRestaurant(client: Socket, payload: { restaurantId: string }) {
    if (!payload?.restaurantId) return { error: 'restaurantId required' };
    const room = `restaurant:${payload.restaurantId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined room ${room}`);
    return { ok: true };
  }

  /**
   * Optional: join a customer-specific room for private notifications.
   * payload: { customerId: string }
   */
  @SubscribeMessage('joinCustomer')
  handleJoinCustomer(client: Socket, payload: { customerId: string }) {
    if (!payload?.customerId) return { error: 'customerId required' };
    const room = `customer:${payload.customerId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined room ${room}`);
    return { ok: true };
  }

  emitOrderCreated(order: OrderSummary) {
    if (!this.server) return;
    try {
      this.server.to(`restaurant:${order.restaurant_id}`).emit('order.created', order);
      this.server.to(`order:${order.id}`).emit('order.created', order);
      this.logger.log(`order.created emitted for order ${order.id}`);
    } catch (err) {
      this.logger.warn('Failed to emit order.created', err as any);
    }
  }

  emitOrderUpdated(order: OrderSummary) {
    if (!this.server) return;
    try {
      this.server.to(`restaurant:${order.restaurant_id}`).emit('order.updated', order);
      this.server.to(`order:${order.id}`).emit('order.updated', order);
      this.logger.log(`order.updated emitted for order ${order.id}`);
    } catch (err) {
      this.logger.warn('Failed to emit order.updated', err as any);
    }
  }

  emitOwnerResponse(orderId: string, response: { accepted: boolean; reason?: string }) {
    if (!this.server) return;
    try {
      this.server.to(`order:${orderId}`).emit('order.owner_response', response);
      this.logger.log(`order.owner_response emitted for order ${orderId}`);
    } catch (err) {
      this.logger.warn('Failed to emit owner_response', err as any);
    }
  }

  /**
   * Emit pickup creation notifications.
   *
   * - Full pickup info is sent to the order room (customer).
   * - Masked code (only last 2 characters visible) is sent to the restaurant room.
   *
   * pickup: { pickup_token?, pickup_code?, expires_at? }
   */
  emitPickupCreated(order: OrderSummary, pickup: PickupSummary) {
    if (!this.server) return;
    try {
      // --- Full payload for the order (customer) ---
      this.server.to(`order:${order.id}`).emit('order.pickup_created', {
        order_id: order.id,
        pickup_token: pickup.pickup_token ?? null,
        pickup_code: pickup.pickup_code != null ? String(pickup.pickup_code) : null,
        expires_at: pickup.expires_at ?? null,
      });

      // --- Masked payload for the restaurant (show last 2 characters/digits only) ---
      const rawCode = pickup.pickup_code != null ? String(pickup.pickup_code) : '';
      let maskedCode: string | null;

      if (!rawCode) {
        maskedCode = null;
      } else if (rawCode.length <= 2) {
        // If too short, mask everything (to avoid leaking a 1-2 digit code)
        maskedCode = '*'.repeat(rawCode.length);
      } else {
        // show last 2 characters, mask the rest
        const lastTwo = rawCode.slice(-2);
        maskedCode = `${'*'.repeat(Math.max(0, rawCode.length - 2))}${lastTwo}`;
      }

      this.server.to(`restaurant:${order.restaurant_id}`).emit('order.pickup_created', {
        order_id: order.id,
        pickup_code_masked: maskedCode,
        expires_at: pickup.expires_at ?? null,
      });

      this.logger.log(`order.pickup_created emitted for order ${order.id} (masked for restaurant)`);
    } catch (err) {
      this.logger.warn('Failed to emit pickup_created', err as any);
    }
  }
}
