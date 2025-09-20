import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../entities/Audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
  ) {}

  async log(userId: string | null, action: string, metadata?: Record<string, any>) {
    const log = this.auditRepo.create({ user_id: userId, action, metadata });
    return this.auditRepo.save(log);
  }

  async findAll() {
    return this.auditRepo.find({ relations: ['user'] });
  }
}
