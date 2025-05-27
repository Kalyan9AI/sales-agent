export interface Hotel {
  id: string;
  hotelName: string;
  managerName: string;
  lastPurchasedProduct: string;
  recommendedProduct: string;
  lastPurchaseDate: string;
  phone?: string;
  email?: string;
}

export interface DashboardMetrics {
  leadsGenerated: number;
  leadsContacted: number;
  leadsClosed: number;
}

export interface EmailDraft {
  recipient: string;
  subject: string;
  body: string;
}

export interface CallState {
  status: 'idle' | 'ringing' | 'connected' | 'ended';
  duration: number;
  hotel?: Hotel;
}

export interface ConversationMessage {
  id: string;
  type: 'ai_response' | 'user_speech';
  content: string;
  timestamp: Date;
} 