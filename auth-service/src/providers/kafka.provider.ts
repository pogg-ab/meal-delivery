import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaProvider implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProvider.name);
  private kafka: Kafka;
  private producer: Producer;
  private isConnected = false;

  constructor() {
    this.kafka = new Kafka({
      clientId: 'identity-service',
      brokers: (process.env.KAFKA_BROKER || 'localhost:9092').split(','),
    });
    this.producer = this.kafka.producer();
  }

  async onModuleInit() {
    try {
      await this.producer.connect();
      this.isConnected = true;
      this.logger.log('Kafka Producer connected');
    } catch (error) {
      this.logger.warn('Kafka Producer connection failed, running without Kafka');
    }
  }

  async onModuleDestroy() {
    if (this.isConnected) {
      await this.producer.disconnect();
    }
  }

  async emit(topic: string, message: Record<string, any>) {
    if (!this.isConnected) {
      this.logger.warn(`Kafka not connected, skipping event to ${topic}`);
      return;
    }
    await this.producer.send({
      topic,
      messages: [{ value: JSON.stringify(message) }],
    });
    this.logger.log(`Kafka event emitted to ${topic}`);
  }
}