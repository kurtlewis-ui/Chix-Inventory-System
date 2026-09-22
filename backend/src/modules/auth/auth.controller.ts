import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  UseGuards,
  Get,
  Patch,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';
import { RequestUser } from '../../common/interfaces/request-user.interface';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Options for the refresh-token cookie. Must be IDENTICAL between res.cookie()
   * and res.clearCookie(), or the browser won't match the cookie to clear it.
   *
   * When the frontend and backend are on DIFFERENT sites (e.g. frontend on
   * dailysmokzvs.com, backend on *.onrender.com), the browser only sends the
   * cookie on cross-site requests if it's SameSite=None + Secure. That's the
   * production default here. For a same-site setup (API on a subdomain of the
   * frontend) set COOKIE_SAMESITE=lax, which is a bit stricter/safer.
   *
   * Env overrides:
   *   COOKIE_SAMESITE = 'none' | 'lax' | 'strict'  (default: 'none' in prod)
   *   COOKIE_SECURE   = 'true' | 'false'           (default: true in prod;
   *                     forced true whenever sameSite='none', a browser rule)
   */
  private refreshCookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    const sameSite = (process.env.COOKIE_SAMESITE?.toLowerCase() as
      | 'none'
      | 'lax'
      | 'strict'
      | undefined) ?? (isProd ? 'none' : 'lax');
    // Browsers REQUIRE Secure when SameSite=None. Also secure by default in prod.
    const secure =
      sameSite === 'none'
        ? true
        : process.env.COOKIE_SECURE
          ? process.env.COOKIE_SECURE === 'true'
          : isProd;
    return {
      httpOnly: true as const,
      secure,
      sameSite,
      path: '/',
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Account locked or disabled' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const result = await this.authService.login(loginDto, ipAddress, userAgent);

    // Set refresh token in HTTP-only cookie (cross-site friendly in prod).
    res.cookie('refreshToken', result.refreshToken, {
      ...this.refreshCookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      success: true,
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'User logout' })
  @ApiResponse({ status: 204, description: 'Logout successful' })
  async logout(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(user.userId, user.sessionId!);

    // Clear refresh token cookie — options MUST match those used to set it,
    // otherwise the browser won't recognise/remove it.
    res.clearCookie('refreshToken', this.refreshCookieOptions());

    return;
  }

  @Public()
  @UseGuards(JwtRefreshAuthGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refreshToken(@CurrentUser() user: RequestUser, @Req() req: Request) {
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

    const result = await this.authService.refreshToken(
      user.userId,
      user.sessionId!,
      ipAddress,
    );

    return {
      success: true,
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
    };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change user password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid password' })
  @ApiResponse({ status: 401, description: 'Current password incorrect' })
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    const result = await this.authService.changePassword(user.userId, changePasswordDto);

    return {
      success: true,
      data: result,
    };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Current user retrieved' })
  async getCurrentUser(@CurrentUser() user: RequestUser) {
    const data = await this.authService.getProfile(user.userId);
    return { success: true, data };
  }

  @Patch('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update your own profile (name, email, photo)' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  async updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateProfileDto,
  ) {
    const data = await this.authService.updateProfile(user.userId, dto);
    return { success: true, data };
  }
}
