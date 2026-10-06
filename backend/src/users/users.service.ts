import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserDocument, User } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(dto: CreateUserDto) {
    const user = await this.userModel.create(dto);
    const userObject = user.toObject();
    delete (userObject as any).password;
    return {
      message: 'Tạo user thành công',
      data: userObject,
    };
  }

  async findAll() {
    return this.userModel
      .find()
      .select('_id username displayName avatarUrl bio onlineStatus lastSeen')
      .lean();
  }

  async findOne(id: string) {
    const user = await this.userModel.findById(id).select('-password').lean();
    if (!user) {
      throw new NotFoundException(`User không tồn tại`);
    }
    return user;
  }

  async findPublicProfile(id: string) {
    const user = await this.userModel
      .findById(id)
      .select('_id username displayName avatarUrl bio onlineStatus lastSeen')
      .lean();
    if (!user) {
      throw new NotFoundException(`User không tồn tại`);
    }
    return user;
  }

  async findByUsername(username: string) {
    if (typeof username !== 'string') {
      throw new BadRequestException('Username không hợp lệ');
    }
    const user = await this.userModel.findOne({ username });
    return user;
  }

  async findByUsernameAndEmail(username: string, email: string) {
    if (typeof username !== 'string' || typeof email !== 'string') {
      throw new BadRequestException('Username và email không hợp lệ');
    }
    const user = await this.userModel.findOne({ username, email });
    if (!user) {
      throw new NotFoundException(`Người dùng không tồn tại`);
    }
    return user;
  }

  async findByEmail(email: string) {
    if (typeof email !== 'string') {
      throw new BadRequestException('Email không hợp lệ');
    }
    return this.userModel.findOne({ email });
  }

  async update(id: string, dto: UpdateUserDto, currentUserId?: string) {
    if (currentUserId && id !== currentUserId) {
      throw new ForbiddenException(
        'Bạn không có quyền chỉnh sửa tài khoản này',
      );
    }

    const user = await this.userModel
      .findByIdAndUpdate(
        id,
        { $set: dto },
        {
          new: true,
          runValidators: true,
        },
      )
      .select('-password')
      .lean();
    if (!user) {
      throw new NotFoundException(`User không tồn tại`);
    }
    return user;
  }

  async remove(id: string, currentUserId?: string) {
    if (currentUserId && id !== currentUserId) {
      throw new ForbiddenException('Bạn không có quyền xóa tài khoản này');
    }

    const user = await this.userModel.findByIdAndDelete(id);
    if (!user) {
      throw new NotFoundException('User không tồn tại');
    }
    return {
      message: 'Xóa user thành công',
    };
  }
}
