import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterEmployeeDto } from './dto/register-employee.dto';
import { JwtUser } from './jwt-user';
import { Public } from '../decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  me(@Req() req: { user: JwtUser }) {
    return this.authService.me(req.user.userId);
  }

  @Post('register/employee')
  @UseGuards(AdminGuard)
  registerEmployee(
    @Body() dto: RegisterEmployeeDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.authService.registerEmployee(dto, req.user);
  }
}
