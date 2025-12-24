import { Provider, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

export const FirebaseProvider: Provider = {
  provide: 'FIREBASE_ADMIN',
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const logger = new Logger('FirebaseProvider');

    const filePath = configService.get<string>('FIREBASE_CREDENTIALS_PATH');
    if (!filePath) {
      throw new Error('FIREBASE_CREDENTIALS_PATH is not set in .env file.');
    }

    // --- THIS IS THE ONLY LINE THAT CHANGED ---
    // We resolve from the current working directory, without adding the extra folder name.
    const resolvedPath = path.resolve(process.cwd(), filePath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Firebase credentials file not found at: ${resolvedPath}`);
    }
    
    logger.log('Initializing Firebase Admin SDK from file...');

    if (admin.apps.length) {
      return admin.apps[0];
    }
    
    const serviceAccount = require(resolvedPath);

    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  },
};