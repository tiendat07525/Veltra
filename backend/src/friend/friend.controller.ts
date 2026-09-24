import { Body, Controller, Param, Post, Req, UseGuards, Get } from "@nestjs/common";
import { FriendService } from "./friend.service";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { SendFriendRequestDto } from "./dto/send-friend-request.dto";

@Controller('friend')
export class FriendController {
    constructor(
        private readonly friendService: FriendService
    ) { }

    @Post('request')
    @UseGuards(JwtAuthGuard)
    async sendFriendRequest( @Body() dto: SendFriendRequestDto, @Req() req: any) {
        const userId = req.user.id
        return this.friendService.sendFriendRequest(dto, userId);
    }

    @Post('request/:requestId/accept')
    @UseGuards(JwtAuthGuard)
    async acceptFriendRequest(@Param('requestId') requestId: string, @Req() req: any) {
        const userId = req.user.id;
        return this.friendService.acceptFriendRequest(requestId, userId);
    }

    @Post('request/:requestId/decline')
    @UseGuards(JwtAuthGuard)
    async declineFriendRequest(@Param('requestId') requestId: string, @Req() req: any) {
        const userId = req.user.id;
        return this.friendService.declineFriendRequest(requestId, userId);
    }

    @Post('remove/:friendId')
    @UseGuards(JwtAuthGuard)
    async removeFriend(@Param('friendId') friendId: string, @Req() req: any) {
        const user = req.user.id;
        return this.friendService.removeFriend(friendId, user);
    }

    @Get('requests')
    @UseGuards(JwtAuthGuard)
    async getFriendRequests(@Req() req: any) {
        const userId = req.user.id;
        return this.friendService.getFriendRequests(userId);
    }

    @Get()
    @UseGuards(JwtAuthGuard)
    async getAllFriend(@Req() req: any) {
        const userId = req.user.id;
        return this.friendService.getAllFriend(userId);
    }

}