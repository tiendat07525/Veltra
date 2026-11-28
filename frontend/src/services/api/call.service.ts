import api from './api';
import { ActiveCallResponse, CallMedia, CallStartResponse } from '@/types/call';

export const callService = {
  async start(conversationId: string, media: CallMedia): Promise<CallStartResponse> {
    const res = await api.post('/call', { conversationId, media });
    return res.data;
  },

  async accept(callId: string): Promise<CallStartResponse> {
    const res = await api.post(`/call/${callId}/accept`);
    return res.data;
  },

  async decline(callId: string): Promise<void> {
    await api.post(`/call/${callId}/decline`);
  },

  async end(callId: string): Promise<void> {
    await api.post(`/call/${callId}/end`);
  },

  async getActive(): Promise<ActiveCallResponse> {
    const res = await api.get('/call/active');
    return res.data;
  },
};
