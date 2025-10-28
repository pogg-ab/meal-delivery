import * as bcrypt from 'bcrypt';

export class PasswordHashUtil {
static async hash(password: string): Promise<string> {
const salt = await bcrypt.genSalt(12);
return bcrypt.hash(password, salt);
}

static async compare(password: string, hash: string): Promise<boolean> {
return bcrypt.compare(password, hash);
}
}