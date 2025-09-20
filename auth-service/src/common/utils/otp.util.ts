import * as bcrypt from 'bcrypt';


export class OtpUtil {
static generateOtp(): string {
return Math.floor(100000 + Math.random() * 900000).toString();
}


static async hashOtp(otp: string): Promise<string> {
const salt = await bcrypt.genSalt(10);
return bcrypt.hash(otp, salt);
}


static async verifyOtp(otp: string, hash: string): Promise<boolean> {
return bcrypt.compare(otp, hash);
}
}