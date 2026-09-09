import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('users')
export class UsersController {
    constructor(private readonly userService: UsersService) { }

    @Get('profile')
    @UseGuards(JwtAuthGuard)
    async getProfile(@Req() req: any) {
        return this.userService.findOne(req.user.id)
    }

    @Patch('profile')
    @UseGuards(JwtAuthGuard)
    async updateProfile(
        @Req() req: any,
        @Body() dto: UpdateUserDto,
    ) {
        return this.userService.update(
            req.user.id,
            dto,
        );
    }

    @Get()
    @UseGuards(JwtAuthGuard)
    findAll() {
        return this.userService.findAll();
    }

    @Get(':id')
    @UseGuards(JwtAuthGuard)
    findOne(@Param('id') id: string) {
        return this.userService.findOne(id);
    }

    @Post()
    create(@Body() dto: CreateUserDto) {
        return this.userService.create(dto);
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard)
    update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
        return this.userService.update(id, dto);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard)
    remove(@Param('id') id: string) {
        return this.userService.remove(id);
    }


}
