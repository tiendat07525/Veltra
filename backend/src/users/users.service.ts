import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserDocument, User } from './schemas/user.schema';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(dto: CreateUserDto) {
    let password = dto.password;
    if (!password.startsWith('$2a$') && !password.startsWith('$2b$')) {
      password = await bcrypt.hash(password, 10);
    }
    const user = await this.userModel.create({
      ...dto,
      password,
    });
    const userObject = user.toObject() as Record<string, any>;
    delete userObject.password;
    return {
      message: 'Tạo user thành công',
      data: userObject,
    };
  }

  async findAll(query?: { page?: number; limit?: number; search?: string }) {
    const rawPage = Number(query?.page);
    const rawLimit = Number(query?.limit);

    // Enforce safe normalization: page >= 1, limit between 1 and 50, default 20
    const page = !isNaN(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const defaultLimit = 20;
    const maxLimit = 50;
    const limit =
      !isNaN(rawLimit) && rawLimit > 0
        ? Math.min(Math.floor(rawLimit), maxLimit)
        : defaultLimit;

    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};
    if (query?.search && typeof query.search === 'string') {
      const trimmed = query.search.trim().slice(0, 100);
      if (trimmed.length > 0) {
        const safePattern = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchRegex = new RegExp(safePattern, 'i');
        // Never match email: result presence would reveal which addresses are registered
        filter.$or = [{ username: searchRegex }, { displayName: searchRegex }];
      }
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('_id username displayName avatarUrl bio onlineStatus lastSeen')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    return {
      data: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findOne(id: string) {
    const user = await this.userModel.findById(id).select('-password').lean();
    if (!user) {
      throw new NotFoundException(`User không tồn tại`);
    }
    return user;
  }

  async findPublicProfile(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID người dùng không hợp lệ');
    }

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

  // Only for login: the password hash is excluded from every other query
  async findByUsernameWithPassword(username: string) {
    if (typeof username !== 'string') {
      throw new BadRequestException('Username không hợp lệ');
    }
    return this.userModel.findOne({ username }).select('+password');
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
