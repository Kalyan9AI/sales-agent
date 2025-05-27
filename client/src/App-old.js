import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { 
  Phone, 
  PhoneCall, 
  User, 
  Bot, 
  Waves, 
  Clock,
  CheckCircle,
  XCircle,
  Loader
} from 'lucide-react';

function App() {
  const [phoneNumber, setPhoneNumber] = useState('(925) 325-2609');
  const [currentCall, setCurrentCall] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [callStatus, setCallStatus] = useState('idle'); // idle, calling, connected, completed
  const [isLoading, setIsLoading] = useState(false);
  const conversationEndRef = useRef(null);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io('http://localhost:3002');

    // Socket event handlers
    newSocket.on('connect', () => {
      console.log('Connected to server');
    });

    newSocket.on('callStatus', (data) => {
      console.log('Call status update:', data);
      setCallStatus(data.status);
      setCurrentCall(data);
    });

    newSocket.on('conversationUpdate', (data) => {
      console.log('Conversation update:', data);
      // Ensure timestamp is a Date object
      const messageWithDate = {
        ...data,
        id: Date.now() + Math.random(), // Add unique ID
        timestamp: new Date(data.timestamp) // Convert to Date object
      };
      setConversations(prev => [...prev, messageWithDate]);
    });

    newSocket.on('callCompleted', (data) => {
      console.log('Call completed:', data);
      setCallStatus('completed');
      setIsLoading(false);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    return () => newSocket.close();
  }, []);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations]);

  const handleMakeCall = async () => {
    if (!phoneNumber.trim()) {
      alert('Please enter a phone number');
      return;
    }

    setIsLoading(true);
    setCallStatus('calling');
    setConversations([]);

    try {
      const response = await axios.post('http://localhost:3002/api/make-call', {
        phoneNumber: phoneNumber.trim()
      });
      
      console.log('Call initiated:', response.data);
    } catch (error) {
      console.error('Error making call:', error);
      setIsLoading(false);
      setCallStatus('idle');
      alert('Failed to make call. Please check your credentials and try again.');
    }
  };

  const formatPhoneNumber = (value) => {
    // Remove all non-digits
    const phoneNumber = value.replace(/\D/g, '');
    
    // Format as (XXX) XXX-XXXX
    const phoneNumberLength = phoneNumber.length;
    if (phoneNumberLength < 4) return phoneNumber;
    if (phoneNumberLength < 7) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    }
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
  };

  const handlePhoneChange = (e) => {
    const formattedNumber = formatPhoneNumber(e.target.value);
    setPhoneNumber(formattedNumber);
  };

  const getStatusText = () => {
    switch (callStatus) {
      case 'calling': return 'Calling...';
      case 'connected': return 'Connected';
      case 'completed': return 'Call Completed';
      default: return 'Ready to call';
    }
  };

  const getStatusIcon = () => {
    switch (callStatus) {
      case 'calling':
      case 'initiated':
      case 'ringing':
        return <Loader className="animate-spin" size={20} />;
      case 'connected':
      case 'answered':
        return <PhoneCall className="text-accent-500" size={20} />;
      case 'completed':
        return <CheckCircle className="text-accent-500" size={20} />;
      case 'failed':
        return <XCircle className="text-red-500" size={20} />;
      default:
        return <Phone size={20} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary-500 rounded-lg flex items-center justify-center">
                <Bot className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  Hotel Breakfast Supplies Voice Agent
                </h1>
                <p className="text-sm text-gray-500">
                  AI-powered sales calls for hotel managers
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              {getStatusIcon()}
              <span>{getStatusText()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Panel - Call Controls */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6 border">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Phone className="mr-2 text-primary-500" size={20} />
                Make a Call
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                    Customer Phone Number (US)
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    placeholder="(555) 123-4567"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-lg font-mono"
                    maxLength="14"
                  />
                </div>
                
                <button
                  onClick={handleMakeCall}
                  disabled={isLoading || !phoneNumber.trim() || phoneNumber.length < 14}
                  className="w-full bg-primary-500 hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center space-x-2"
                >
                  {isLoading ? (
                    <>
                      <Loader className="animate-spin" size={20} />
                      <span>Calling...</span>
                    </>
                  ) : (
                    <>
                      <PhoneCall size={20} />
                      <span>Start Call</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Call Information */}
            {currentCall && (
              <div className="bg-white rounded-xl shadow-sm p-6 border">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Waves className="mr-2 text-accent-500" size={20} />
                  Call Information
                </h3>
                
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Call ID:</span>
                    <span className="font-mono text-sm">{currentCall.callId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      callStatus === 'connected' || callStatus === 'answered' 
                        ? 'bg-green-100 text-green-800'
                        : callStatus === 'failed'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {callStatus.charAt(0).toUpperCase() + callStatus.slice(1)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Phone:</span>
                    <span className="font-mono">{phoneNumber}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
              <h3 className="text-lg font-semibold text-blue-900 mb-3">
                How it works
              </h3>
              <ul className="space-y-2 text-sm text-blue-800">
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">1.</span>
                  Enter a US phone number to call
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">2.</span>
                  AI agent will call and naturally introduce the hotel breakfast supplies company
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">3.</span>
                  Watch the live conversation in real-time on the right panel
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">4.</span>
                  AI handles sales, reorders, and product recommendations automatically
                </li>
              </ul>
            </div>
          </div>

          {/* Right Panel - Live Conversation */}
          <div className="bg-white rounded-xl shadow-sm border">
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                <Clock className="mr-2 text-primary-500" size={20} />
                Live Conversation
                {(callStatus === 'connected' || callStatus === 'answered') && (
                  <div className="ml-auto flex items-center space-x-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-gray-500">Live</span>
                  </div>
                )}
              </h2>
            </div>
            
            <div className="h-96 overflow-y-auto conversation-scroll p-6">
              {conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Bot size={48} className="mb-4 opacity-50" />
                  <p className="text-center">
                    {callStatus === 'idle' 
                      ? 'No active calls. Start a call to see the conversation here.'
                      : 'Waiting for conversation to begin...'
                    }
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {conversations.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.type === 'ai_response' ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[80%] p-4 rounded-lg ${
                          message.type === 'ai_response'
                            ? 'bg-blue-50 border border-blue-200'
                            : 'bg-green-50 border border-green-200'
                        }`}
                      >
                        <div className="flex items-center mb-2">
                          {message.type === 'ai_response' ? (
                            <>
                              <Bot size={16} className="text-blue-600 mr-2" />
                              <span className="text-sm font-medium text-blue-900">AI Agent</span>
                            </>
                          ) : (
                            <>
                              <User size={16} className="text-green-600 mr-2" />
                              <span className="text-sm font-medium text-green-900">Customer</span>
                            </>
                          )}
                          <span className="text-xs text-gray-500 ml-auto">
                            {message.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-gray-800">{message.content}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={conversationEndRef} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App; 