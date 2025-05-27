import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  Card,
  CardContent,
  Divider,
  Chip,
  Button,
  Grid,
  LinearProgress,
  Avatar,
  List,
  ListItem,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import {
  Analytics,
  ShoppingCart,
  Person,
  CreditCard,
  CheckCircle,
  TrendingUp,
  Phone,
  Schedule,
  AttachMoney
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

interface CallInsightsProps {
  open: boolean;
  onClose: () => void;
  onProceedToProcessing: () => void;
  conversation: any[];
  callId: string;
  hotel: any;
}

interface CallAnalysis {
  callSummary: string;
  customerSentiment: 'positive' | 'neutral' | 'negative';
  orderDetails: {
    products: Array<{
      name: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
    subtotal: number;
    tax: number;
    total: number;
  };
  customerDetails: {
    name: string;
    hotel: string;
    phone: string;
    email: string;
  };
  callMetrics: {
    duration: string;
    responseTime: string;
    satisfaction: number;
  };
  nextSteps: string[];
  paymentInfo: {
    method: string;
    cardLast4: string;
    amount: number;
    status: string;
  };
}

const CallInsights: React.FC<CallInsightsProps> = ({ 
  open, 
  onClose, 
  onProceedToProcessing, 
  conversation, 
  callId, 
  hotel 
}) => {
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<CallAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoScrolling, setAutoScrolling] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const placeOrderButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open && conversation.length > 0) {
      analyzeCall();
    }
  }, [open, conversation]);

  // Auto-scroll and auto-click functionality
  useEffect(() => {
    if (analysis && !loading && !error) {
      // Start auto-scroll after 3.5 seconds
      const scrollTimer = setTimeout(() => {
        setAutoScrolling(true);
        
        // Smooth scroll to bottom
        if (dialogContentRef.current) {
          dialogContentRef.current.scrollTo({
            top: dialogContentRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
        
        // Auto-click place order button after scrolling completes (if order exists)
        if (analysis.orderDetails.total > 0) {
          const clickTimer = setTimeout(() => {
            if (placeOrderButtonRef.current) {
              setPlacingOrder(true);
              
              // Simulate processing time before actually proceeding
              setTimeout(() => {
                onProceedToProcessing();
              }, 2000); // 2 seconds loading effect
            }
          }, 1500); // 1.5 seconds after scroll starts
          
          return () => clearTimeout(clickTimer);
        }
      }, 3500); // 3.5 seconds delay
      
      return () => clearTimeout(scrollTimer);
    }
  }, [analysis, loading, error, onProceedToProcessing]);

  // Reset states when dialog closes
  useEffect(() => {
    if (!open) {
      setAutoScrolling(false);
      setPlacingOrder(false);
      setLoading(true);
      setAnalysis(null);
      setError(null);
    }
  }, [open]);

  const analyzeCall = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Prepare conversation for analysis
      const conversationText = conversation
        .filter(msg => msg.role !== 'system')
        .map(msg => `${msg.role === 'user' ? 'Customer' : 'Agent'}: ${msg.content}`)
        .join('\n');

      const analysisPrompt = `
Analyze this sales call conversation and provide detailed insights in JSON format:

CONVERSATION:
${conversationText}

HOTEL DETAILS:
- Hotel: ${hotel?.hotelName}
- Manager: ${hotel?.managerName}
- Phone: ${hotel?.phone}
- Email: ${hotel?.email}

Please provide analysis in this exact JSON structure:
{
  "callSummary": "Brief summary of the call outcome",
  "customerSentiment": "positive|neutral|negative",
  "orderDetails": {
    "products": [
      {
        "name": "Product name",
        "quantity": number,
        "unitPrice": number,
        "total": number
      }
    ],
    "subtotal": number,
    "tax": number (8.5% of subtotal),
    "total": number
  },
  "customerDetails": {
    "name": "${hotel?.managerName}",
    "hotel": "${hotel?.hotelName}",
    "phone": "${hotel?.phone}",
    "email": "${hotel?.email}"
  },
  "callMetrics": {
    "duration": "estimated call duration",
    "responseTime": "average response time",
    "satisfaction": number (1-10 scale)
  },
  "nextSteps": ["array of recommended next steps"],
  "paymentInfo": {
    "method": "Credit Card",
    "cardLast4": "4567",
    "amount": total from orderDetails,
    "status": "Processed"
  }
}

Focus on extracting actual order details from the conversation. If no order was placed, set products array as empty and totals as 0.
`;

      const response = await axios.post('/api/analyze-call', {
        prompt: analysisPrompt,
        callId: callId
      });

      setAnalysis(response.data.analysis);
    } catch (error) {
      console.error('Error analyzing call:', error);
      setError('Failed to analyze call. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return '#10b981';
      case 'negative': return '#ef4444';
      default: return '#f59e0b';
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return '😊';
      case 'negative': return '😞';
      default: return '😐';
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          minHeight: '80vh'
        }
      }}
    >
      <DialogTitle sx={{ 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        textAlign: 'center',
        py: 3
      }}>
        <Analytics sx={{ mr: 2, fontSize: 32 }} />
        <Typography variant="h4" component="span" fontWeight="bold">
          Call Insights & Analysis
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }} ref={dialogContentRef}>
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                  <Analytics sx={{ fontSize: 60, color: '#667eea', mb: 2 }} />
                </motion.div>
                <Typography variant="h6" gutterBottom>
                  Analyzing Call with AI...
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Processing conversation, extracting insights, and generating order details
                </Typography>
                <LinearProgress sx={{ width: '60%', mx: 'auto' }} />
              </Box>
            </motion.div>
          )}

          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="h6" color="error" gutterBottom>
                  Analysis Failed
                </Typography>
                <Typography variant="body2" sx={{ mb: 3 }}>
                  {error}
                </Typography>
                <Button variant="contained" onClick={analyzeCall}>
                  Retry Analysis
                </Button>
              </Box>
            </motion.div>
          )}

          {analysis && (
            <motion.div
              key="analysis"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Box sx={{ p: 4 }}>
                {/* Auto-scroll indicator */}
                {autoScrolling && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ marginBottom: 16 }}
                  >
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      p: 1,
                      backgroundColor: '#e0f2fe',
                      borderRadius: 1,
                      border: '1px solid #0284c7'
                    }}>
                      <motion.div
                        animate={{ y: [0, -3, 0] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      >
                        <Typography variant="caption" color="primary" sx={{ fontWeight: 'bold' }}>
                          📄 Auto-scrolling to review complete analysis...
                        </Typography>
                      </motion.div>
                    </Box>
                  </motion.div>
                )}

                {/* Call Summary */}
                <Card sx={{ mb: 3, borderRadius: 2 }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <Phone sx={{ mr: 2, color: '#667eea' }} />
                      <Typography variant="h6" fontWeight="bold">
                        Call Summary
                      </Typography>
                      <Chip 
                        label={`${getSentimentIcon(analysis.customerSentiment)} ${analysis.customerSentiment.toUpperCase()}`}
                        sx={{ 
                          ml: 'auto',
                          backgroundColor: getSentimentColor(analysis.customerSentiment),
                          color: 'white',
                          fontWeight: 'bold'
                        }}
                      />
                    </Box>
                    <Typography variant="body1">
                      {analysis.callSummary}
                    </Typography>
                  </CardContent>
                </Card>

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {/* Order Details */}
                  <Box sx={{ flex: '1 1 45%', minWidth: '400px' }}>
                    <Card sx={{ height: '100%', borderRadius: 2 }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                          <ShoppingCart sx={{ mr: 2, color: '#10b981' }} />
                          <Typography variant="h6" fontWeight="bold">
                            Order Details
                          </Typography>
                        </Box>
                        
                        {analysis.orderDetails.products.length > 0 ? (
                          <>
                            {analysis.orderDetails.products.map((product, index) => (
                              <Box key={index} sx={{ mb: 2, p: 2, backgroundColor: '#f8fafc', borderRadius: 1 }}>
                                <Typography variant="subtitle1" fontWeight="bold">
                                  {product.name}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  Quantity: {product.quantity} cases × ${product.unitPrice} = ${product.total}
                                </Typography>
                              </Box>
                            ))}
                            
                            <Divider sx={{ my: 2 }} />
                            
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                              <Typography>Subtotal:</Typography>
                              <Typography>${analysis.orderDetails.subtotal}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                              <Typography>Tax (8.5%):</Typography>
                              <Typography>${analysis.orderDetails.tax}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                              <Typography variant="h6">Total:</Typography>
                              <Typography variant="h6" color="primary">${analysis.orderDetails.total}</Typography>
                            </Box>
                          </>
                        ) : (
                          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                            No order was placed during this call
                          </Typography>
                        )}
                      </CardContent>
                    </Card>
                  </Box>

                  {/* Customer & Payment Info */}
                  <Box sx={{ flex: '1 1 45%', minWidth: '400px' }}>
                    <Card sx={{ mb: 3, borderRadius: 2 }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                          <Person sx={{ mr: 2, color: '#3b82f6' }} />
                          <Typography variant="h6" fontWeight="bold">
                            Customer Details
                          </Typography>
                        </Box>
                        
                        <List dense>
                          <ListItem>
                            <ListItemText 
                              primary="Manager" 
                              secondary={analysis.customerDetails.name}
                            />
                          </ListItem>
                          <ListItem>
                            <ListItemText 
                              primary="Hotel" 
                              secondary={analysis.customerDetails.hotel}
                            />
                          </ListItem>
                          <ListItem>
                            <ListItemText 
                              primary="Phone" 
                              secondary={analysis.customerDetails.phone}
                            />
                          </ListItem>
                          <ListItem>
                            <ListItemText 
                              primary="Email" 
                              secondary={analysis.customerDetails.email}
                            />
                          </ListItem>
                        </List>
                      </CardContent>
                    </Card>

                    {/* Payment Information */}
                    {analysis.orderDetails.total > 0 && (
                      <Card sx={{ borderRadius: 2 }}>
                        <CardContent>
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                            <CreditCard sx={{ mr: 2, color: '#10b981' }} />
                            <Typography variant="h6" fontWeight="bold">
                              Payment Information
                            </Typography>
                            <Chip 
                              label={analysis.paymentInfo.status}
                              color="success"
                              size="small"
                              sx={{ ml: 'auto' }}
                            />
                          </Box>
                          
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography>Payment Method:</Typography>
                            <Typography>{analysis.paymentInfo.method}</Typography>
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography>Card Ending:</Typography>
                            <Typography>****{analysis.paymentInfo.cardLast4}</Typography>
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                            <Typography>Amount Charged:</Typography>
                            <Typography color="success.main">${analysis.paymentInfo.amount}</Typography>
                          </Box>
                        </CardContent>
                      </Card>
                    )}
                  </Box>

                  {/* Call Metrics */}
                  <Box sx={{ flex: '1 1 45%', minWidth: '400px' }}>
                    <Card sx={{ borderRadius: 2 }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                          <TrendingUp sx={{ mr: 2, color: '#f59e0b' }} />
                          <Typography variant="h6" fontWeight="bold">
                            Call Metrics
                          </Typography>
                        </Box>
                        
                        <Box sx={{ display: 'flex', gap: 2 }}>
                          <Box sx={{ flex: 1, textAlign: 'center', p: 2, backgroundColor: '#f0f9ff', borderRadius: 1 }}>
                            <Schedule sx={{ color: '#3b82f6', mb: 1 }} />
                            <Typography variant="h6" fontWeight="bold">
                              {analysis.callMetrics.duration}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Call Duration
                            </Typography>
                          </Box>
                          <Box sx={{ flex: 1, textAlign: 'center', p: 2, backgroundColor: '#f0fdf4', borderRadius: 1 }}>
                            <CheckCircle sx={{ color: '#10b981', mb: 1 }} />
                            <Typography variant="h6" fontWeight="bold">
                              {analysis.callMetrics.satisfaction}/10
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Satisfaction
                            </Typography>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  </Box>

                  {/* Next Steps */}
                  <Box sx={{ flex: '1 1 45%', minWidth: '400px' }}>
                    <Card sx={{ borderRadius: 2 }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                          <CheckCircle sx={{ mr: 2, color: '#10b981' }} />
                          <Typography variant="h6" fontWeight="bold">
                            Recommended Next Steps
                          </Typography>
                        </Box>
                        
                        <List dense>
                          {analysis.nextSteps.map((step, index) => (
                            <ListItem key={index}>
                              <ListItemIcon>
                                <Box sx={{ 
                                  width: 24, 
                                  height: 24, 
                                  borderRadius: '50%', 
                                  backgroundColor: '#10b981', 
                                  color: 'white',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '12px',
                                  fontWeight: 'bold'
                                }}>
                                  {index + 1}
                                </Box>
                              </ListItemIcon>
                              <ListItemText primary={step} />
                            </ListItem>
                          ))}
                        </List>
                      </CardContent>
                    </Card>
                  </Box>
                </Box>

                {/* Action Buttons */}
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 4 }}>
                  <Button
                    variant="outlined"
                    onClick={onClose}
                    sx={{ px: 4, py: 1.5 }}
                  >
                    Close Analysis
                  </Button>
                  
                  {analysis.orderDetails.total > 0 && (
                    <Button
                      ref={placeOrderButtonRef}
                      variant="contained"
                      onClick={onProceedToProcessing}
                      disabled={placingOrder}
                      sx={{
                        px: 4,
                        py: 1.5,
                        background: placingOrder 
                          ? 'linear-gradient(45deg, #6b7280, #4b5563)' 
                          : 'linear-gradient(45deg, #10b981, #059669)',
                        '&:hover': {
                          background: placingOrder 
                            ? 'linear-gradient(45deg, #6b7280, #4b5563)'
                            : 'linear-gradient(45deg, #059669, #047857)',
                        },
                        '&:disabled': {
                          background: 'linear-gradient(45deg, #6b7280, #4b5563)',
                          color: 'white'
                        }
                      }}
                    >
                      {placingOrder ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          >
                            <ShoppingCart sx={{ fontSize: 20 }} />
                          </motion.div>
                          Placing Order...
                        </Box>
                      ) : (
                        'Place Order →'
                      )}
                    </Button>
                  )}
                </Box>

                {/* Auto-scroll completion indicator */}
                {autoScrolling && analysis.orderDetails.total > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.5 }}
                    style={{ marginTop: 16 }}
                  >
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      p: 2,
                      backgroundColor: '#f0fdf4',
                      borderRadius: 1,
                      border: '1px solid #10b981'
                    }}>
                      <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      >
                        <Typography variant="body2" color="success.main" sx={{ fontWeight: 'bold' }}>
                          🎯 Ready to place order automatically...
                        </Typography>
                      </motion.div>
                    </Box>
                  </motion.div>
                )}
              </Box>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default CallInsights; 