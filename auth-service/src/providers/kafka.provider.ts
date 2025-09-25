import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Producer, Consumer } from 'kafkajs';

@Injectable()
export class KafkaProvider implements OnModuleInit, OnModuleDestroy {
private readonly logger = new Logger(KafkaProvider.name);
private kafka: Kafka;
private producer: Producer;

constructor() {
this.kafka = new Kafka({
clientId: 'identity-service',
brokers: (process.env.KAFKA_BROKER || 'localhost:9092').split(','),
});
this.producer = this.kafka.producer();
}

async onModuleInit() {
await this.producer.connect();
this.logger.log('Kafka Producer connected');
}

async onModuleDestroy() {
await this.producer.disconnect();
}

async emit(topic: string, message: Record<string, any>) {
await this.producer.send({
topic,
messages: [{ value: JSON.stringify(message) }],
});
this.logger.log(`Kafka event emitted to ${topic}`);
 }  
}