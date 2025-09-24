import { Module } from '@nestjs/common';
import { KafkaProvider } from '../../providers/kafka.provider';
import { MailerProvider } from '../../providers/mailer.provider';

@Module({
  providers: [KafkaProvider, MailerProvider],
  exports: [KafkaProvider, MailerProvider],
})
export class SharedModule {}