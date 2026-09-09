import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserDocument, User } from './schemas/user.schema';

@Injectable()
export class UsersService {
    constructor(
        @InjectModel(User.name)
        private readonly userModel: Model<UserDocument>) {

    }

    async create(dto: CreateUserDto) {
        const user = await this.userModel.create(dto);
        return {
            message: 'Tạo user thành công',
            data: user
        }
    }

    async findAll() {
        return this.userModel
            .find()
            .select('-password')
            .lean()
    }

    async findOne(id: string) {
        const user = await this.userModel
            .findById(id)
            .select('-password')
            .lean()
        if (!user) {
            throw new NotFoundException(`User không tồn tại`)
        }
        return user
    }

    async findByUsername(username: string) {
        if(typeof username !== "string"){
            throw new BadRequestException("Username không hợp lệ")
        }
        const user = await this.userModel.findOne({ username })
        if (!user) {
            throw new NotFoundException(`User không tồn tại`)
        }
        return user
    }

    async findByUsernameAndEmail(username: string, email: string) {
        if(typeof username !== "string" || typeof email !== "string"){
            throw new BadRequestException("Username và email không hợp lệ")
        }
        const user = await this.userModel.findOne({ username, email })
        if (!user) {
            throw new NotFoundException(`Người dùng không tồn tại`)
        }
        return user;
    }

    async findByEmail(email: string) {
        if(typeof email !== "string"){
            throw new BadRequestException("Email không hợp lệ")
        }
        return this.userModel.findOne({ email })
    }

    async update(id: string, dto: UpdateUserDto) {
        const user = await this.userModel.findByIdAndUpdate(id, { $set: dto }, {
            new: true,
            runValidators: true
        })
            .select('-password')
            .lean();
        if (!user) {
            throw new NotFoundException(`User không tồn tại`)
        }
        return user
    }

    async remove(id: string) {
        const user = await this.userModel.findByIdAndDelete(id)
        if (!user) {
            throw new NotFoundException('User không tồn tại')
        }
        return {
            message: 'Xóa user thành công'
        }
    }
}
