import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * Used by an Admin to set a new password for another user.
 * The matching check is enforced in the service as well as the frontend.
 */
export class ResetPasswordDto {
  @ApiProperty({ example: 'newpass' })
  @IsString()
  @IsNotEmpty()
  @MinLength(4, { message: 'Password must be at least 4 characters long' })
  newPassword: string;

  @ApiProperty({ example: 'newpass' })
  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}
