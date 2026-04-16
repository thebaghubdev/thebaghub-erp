import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { StaffOnlyGuard } from './staff-only.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterClientDto } from './dto/register-client.dto';
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

  @Public()
  @Post('register/client')
  registerClient(@Body() dto: RegisterClientDto) {
    return this.authService.registerClient(dto);
  }

  @Get('me')
  me(@Req() req: { user: JwtUser }) {
    return this.authService.me(req.user.userId);
  }

  @Post('register/employee')
  @UseGuards(StaffOnlyGuard)
  registerEmployee(
    @Body() dto: RegisterEmployeeDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.authService.registerEmployee(dto, req.user);
  }
}
