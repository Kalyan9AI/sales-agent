import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  IconButton,
  Stepper,
  Step,
  StepLabel,
  LinearProgress
} from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Close,
  Email,
  CheckCircle,
  Visibility,
  Phone,
  Call,
  Send
} from '@mui/icons-material';
import { Hotel } from '../types';
import CallSimulation from './CallSimulation';

interface EmailDraftModalProps {
  open: boolean;
  onClose: () => void;
  hotel: Hotel | null;
}

const EmailDraftModal: React.FC<EmailDraftModalProps> = ({ open, onClose, hotel }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [showCallSimulation, setShowCallSimulation] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [streamingText, setStreamingText] = useState('');
  const [showStreaming, setShowStreaming] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftingProgress, setDraftingProgress] = useState(0);
  const [draftStreamingText, setDraftStreamingText] = useState('');
  const [showPhoneInput, setShowPhoneInput] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [shouldVibrate, setShouldVibrate] = useState(false);
  const [vibrateTimer, setVibrateTimer] = useState<NodeJS.Timeout | null>(null);

  const generateEmailContent = () => {
    if (!hotel) return { subject: '', body: '' };

    const subject = `New Seasonal Products for ${hotel.hotelName} - ${hotel.recommendedProduct}`;
    const body = `Dear ${hotel.managerName},

I hope this email finds you well! I'm reaching out from US Hotel Food Supplies regarding some exciting new products that would be perfect for ${hotel.hotelName}.

I noticed you recently purchased ${hotel.lastPurchasedProduct} on ${hotel.lastPurchaseDate}. Based on your preferences, I'd love to introduce you to our ${hotel.recommendedProduct} - it's been incredibly popular with our hotel partners and would be a fantastic addition to your breakfast offerings.

Key benefits:
• Premium quality ingredients
• Extended shelf life
• Guest satisfaction guarantee
• Competitive wholesale pricing

Would you be available for a brief call this week to discuss how this product could enhance your guests' breakfast experience? I can also share some exclusive pricing options available for valued partners like ${hotel.hotelName}.

Looking forward to hearing from you!

Best regards,
Sarah Mitchell
Senior Account Manager
US Hotel Food Supplies
📞 (555) 123-4567
✉️ sarah.mitchell@ushotelfoodsupplies.com`;

    return { subject, body };
  };

  const { subject, body } = generateEmailContent();

  const handleSendEmail = useCallback(() => {
    setLoadingProgress(0);
    setShowStreaming(true);
    setStreamingText('');
    
    // Simulate email sending progress
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 2;
      });
    }, 50);

    // Streaming text animation
    const emailContent = `Sending personalized email to ${hotel?.managerName} at ${hotel?.hotelName}...

📧 Composing message with product recommendation: ${hotel?.recommendedProduct}
🔍 Analyzing customer purchase history: ${hotel?.lastPurchasedProduct}
📅 Referencing last purchase date: ${hotel?.lastPurchaseDate}
✨ Personalizing content for ${hotel?.hotelName}
🚀 Deploying email through secure channels...
📊 Tracking delivery metrics...
✅ Email successfully delivered!`;

    let currentIndex = 0;
    const streamInterval = setInterval(() => {
      if (currentIndex < emailContent.length) {
        setStreamingText(emailContent.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        clearInterval(streamInterval);
      }
    }, 30);

    // Complete the sending process
    setTimeout(() => {
      setShowStreaming(false);
      setTimeout(() => {
        setActiveTab(1);
        setTimeout(() => {
          setActiveTab(2);
          setTimeout(() => {
            setActiveTab(3);
          }, 2000);
        }, 3000);
      }, 1000);
    }, 3000);
  }, [hotel?.hotelName, hotel?.managerName, hotel?.recommendedProduct, hotel?.lastPurchasedProduct, hotel?.lastPurchaseDate]);

  const startDrafting = useCallback(() => {
    setIsDrafting(true);
    setDraftingProgress(0);
    setDraftStreamingText('');
    
    // Email content to stream (without duplicate greeting)
    const emailText = `Subject: ${subject}\n\n${body}`;
    
    // Drafting progress bar - complete in exactly 4 seconds
    const progressInterval = setInterval(() => {
      setDraftingProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 2.5; // Complete in 4 seconds (100/2.5 * 100ms = 4000ms)
      });
    }, 100);

    // Streaming text animation - stream for exactly 4 seconds
    let currentIndex = 0;
    const streamInterval = setInterval(() => {
      if (currentIndex < emailText.length) {
        setDraftStreamingText(emailText.substring(0, currentIndex + 1));
        currentIndex++;
      }
      // Continue even if we've reached the end of the email
    }, 8); // Stream characters every 8ms

    // End drafting after exactly 4 seconds regardless of email length
    setTimeout(() => {
      clearInterval(streamInterval);
      clearInterval(progressInterval);
      setIsDrafting(false);
      handleSendEmail();
    }, 4000); // Exactly 4 seconds

  }, [subject, body, handleSendEmail]);

  const handleStartCall = () => {
    // Clear vibration timer and state when button is clicked
    if (vibrateTimer) {
      clearTimeout(vibrateTimer);
      setVibrateTimer(null);
    }
    setShouldVibrate(false);
    
    setShowPhoneInput(true);
  };

  const validatePhoneNumber = (phone: string) => {
    // Remove all non-digits
    const cleaned = phone.replace(/\D/g, '');
    
    // Check if it's a valid US phone number (10 digits, optionally starting with 1)
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    }
    return null;
  };

  const handlePhoneSubmit = () => {
    const formattedPhone = validatePhoneNumber(phoneNumber);
    
    if (!formattedPhone) {
      setPhoneError('Please enter a valid US phone number (10 digits)');
      return;
    }
    
    setPhoneError('');
    setShowPhoneInput(false);
    setShowCallSimulation(true);
  };

  const formatPhoneInput = (value: string) => {
    // Remove all non-digits
    const cleaned = value.replace(/\D/g, '');
    
    // Format as (XXX) XXX-XXXX
    if (cleaned.length >= 6) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
    } else if (cleaned.length >= 3) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    } else {
      return cleaned;
    }
  };

  const handleClose = () => {
    setActiveTab(0);
    setShowCallSimulation(false);
    setLoadingProgress(0);
    setStreamingText('');
    setShowStreaming(false);
    setShowPhoneInput(false);
    setPhoneNumber('');
    setPhoneError('');
    onClose();
  };

  const steps = ['Draft Email', 'Email Sent', 'Email Opened', 'Start Call'];

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setActiveTab(0);
        setShowCallSimulation(false);
        setLoadingProgress(0);
        setStreamingText('');
        setShowStreaming(false);
        setIsDrafting(false);
        setDraftingProgress(0);
        setDraftStreamingText('');
        setShowPhoneInput(false);
        setPhoneNumber('');
        setPhoneError('');
      }, 300);
    } else if (open) {
      // Auto-start drafting process immediately when modal opens
      setTimeout(() => {
        startDrafting();
      }, 500); // Very short delay to show modal open animation
    }
  }, [open, startDrafting]);

  // Effect to start vibration timer when Tab 3 (Call Preparation) becomes active
  useEffect(() => {
    if (activeTab === 3) {
      // Clear any existing timer
      if (vibrateTimer) {
        clearTimeout(vibrateTimer);
      }
      
      // Set timer for 3.5 seconds
      const timer = setTimeout(() => {
        setShouldVibrate(true);
      }, 3500);
      
      setVibrateTimer(timer);
      setShouldVibrate(false);
      
      // Cleanup function
      return () => {
        if (timer) {
          clearTimeout(timer);
        }
      };
    }
  }, [activeTab]);

  // Cleanup timer when component unmounts or modal closes
  useEffect(() => {
    if (!open) {
      if (vibrateTimer) {
        clearTimeout(vibrateTimer);
        setVibrateTimer(null);
      }
      setShouldVibrate(false);
    }
  }, [open, vibrateTimer]);

  return (
    <>
      <Dialog 
        open={open && !showCallSimulation && !showPhoneInput} 
        onClose={handleClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxHeight: '90vh'
          }
        }}
      >
        <DialogTitle sx={{ 
          background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <Typography variant="h6" fontWeight="bold">
            Outreach Campaign - {hotel?.hotelName}
          </Typography>
          <IconButton onClick={handleClose} sx={{ color: 'white' }}>
            <Close />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 0 }}>
          {/* Progress Stepper */}
          <Box sx={{ p: 3, borderBottom: '1px solid #e2e8f0' }}>
            <Stepper activeStep={activeTab} alternativeLabel>
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          </Box>

          <Box sx={{ p: 3 }}>
            <AnimatePresence mode="wait">
              {/* Tab 0: Email Draft */}
              {activeTab === 0 && (
                <motion.div
                  key="draft"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <Box display="flex" alignItems="center" mb={3}>
                    <Email sx={{ color: '#3b82f6', mr: 2 }} />
                    <Typography variant="h6" fontWeight="bold">
                      Draft Personalized Email
                    </Typography>
                  </Box>

                  {/* Drafting Phase */}
                  {isDrafting && (
                    <Box sx={{ mb: 4 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                          style={{ marginRight: 8 }}
                        >
                          ✍️
                        </motion.div>
                        <Typography variant="h6" color="primary">
                          Drafting personalized email...
                        </Typography>
                      </Box>
                      
                      <LinearProgress 
                        variant="determinate" 
                        value={draftingProgress} 
                        sx={{ 
                          mb: 3, 
                          height: 8, 
                          borderRadius: 4,
                          '& .MuiLinearProgress-bar': {
                            background: 'linear-gradient(45deg, #2196F3, #21CBF3)'
                          }
                        }} 
                      />
                      
                      <Card sx={{ 
                        background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
                        border: '1px solid #dee2e6',
                        minHeight: '300px'
                      }}>
                        <CardContent>
                          <Typography 
                            variant="body1" 
                            component="pre" 
                            sx={{ 
                              whiteSpace: 'pre-wrap', 
                              fontFamily: 'monospace',
                              lineHeight: 1.6,
                              color: '#495057'
                            }}
                          >
                            {draftStreamingText}
                            <motion.span
                              animate={{ opacity: [0, 1, 0] }}
                              transition={{ duration: 1, repeat: Infinity }}
                              style={{ borderLeft: '2px solid #007bff', marginLeft: 2 }}
                            >
                              {' '}
                            </motion.span>
                          </Typography>
                        </CardContent>
                      </Card>
                    </Box>
                  )}

                  {/* Streaming Email Effect */}
                  {showStreaming && (
                    <Card sx={{ 
                      mb: 3, 
                      background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
                      color: 'white',
                      minHeight: 200,
                      position: 'relative',
                      overflow: 'hidden'
                    }}>
                      <CardContent>
                        <Box display="flex" alignItems="center" mb={2}>
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                          >
                            <Send sx={{ color: '#10b981', mr: 2 }} />
                          </motion.div>
                          <Typography variant="h6" fontWeight="bold">
                            Sending Email...
                          </Typography>
                        </Box>
                        
                        <LinearProgress 
                          variant="determinate" 
                          value={loadingProgress} 
                          sx={{ 
                            mb: 3, 
                            height: 8, 
                            borderRadius: 4,
                            backgroundColor: 'rgba(255,255,255,0.1)',
                            '& .MuiLinearProgress-bar': {
                              backgroundColor: '#10b981'
                            }
                          }} 
                        />
                        
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            fontFamily: 'monospace',
                            fontSize: '14px',
                            lineHeight: 1.6,
                            color: '#e2e8f0',
                            whiteSpace: 'pre-line',
                            minHeight: 120
                          }}
                        >
                          {streamingText}
                          <motion.span
                            animate={{ opacity: [0, 1, 0] }}
                            transition={{ duration: 1, repeat: Infinity }}
                            style={{ color: '#10b981' }}
                          >
                            |
                          </motion.span>
                        </Typography>
                      </CardContent>
                    </Card>
                  )}

                  {/* Regular Email Form */}
                  {!showStreaming && !isDrafting && (
                    <Box sx={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      height: '300px',
                      color: 'text.secondary'
                    }}>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        style={{ marginBottom: 16 }}
                      >
                        ⏳
                      </motion.div>
                      <Typography variant="h6" color="primary">
                        Preparing personalized email...
                      </Typography>
                    </Box>
                  )}
                </motion.div>
              )}

              {/* Tab 1: Email Sent Success */}
              {activeTab === 1 && (
                <motion.div
                  key="sent"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.5 }}
                >
                  <Box textAlign="center" py={6}>
                    <motion.div
                      animate={{ rotate: 360, scale: [1, 1.2, 1] }}
                      transition={{ duration: 1, repeat: 1 }}
                    >
                      <CheckCircle sx={{ fontSize: 80, color: '#10b981', mb: 3 }} />
                    </motion.div>
                    <Typography variant="h4" fontWeight="bold" color="primary" mb={2}>
                      Email Sent Successfully!
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                      Your personalized email has been delivered to {hotel?.managerName} at {hotel?.hotelName}
                    </Typography>
                    <motion.div
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <Typography variant="body2" color="primary" sx={{ mt: 2 }}>
                        Waiting for response...
                      </Typography>
                    </motion.div>
                  </Box>
                </motion.div>
              )}

              {/* Tab 2: Email Opened */}
              {activeTab === 2 && (
                <motion.div
                  key="opened"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                >
                  <Box textAlign="center" py={6}>
                    <motion.div
                      animate={{ 
                        scale: [1, 1.1, 1],
                        rotate: [0, 5, -5, 0]
                      }}
                      transition={{ duration: 0.8, repeat: 2 }}
                    >
                      <Visibility sx={{ fontSize: 80, color: '#f59e0b', mb: 3 }} />
                    </motion.div>
                    <Typography variant="h4" fontWeight="bold" sx={{ 
                      background: 'linear-gradient(45deg, #f59e0b, #d97706)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      color: 'transparent',
                      mb: 2
                    }}>
                      🎉 Email Opened!
                    </Typography>
                    <Typography variant="body1" color="text.secondary" mb={3}>
                      Great news! {hotel?.managerName} has opened your email. 
                      Perfect timing to make a follow-up call!
                    </Typography>
                    
                    <Card sx={{ maxWidth: 400, mx: 'auto', background: '#fef3c7' }}>
                      <CardContent>
                        <Typography variant="subtitle2" color="primary">
                          📧 Email Engagement Detected
                        </Typography>
                        <Typography variant="body2">
                          Opened: Just now<br/>
                          Read time: 45 seconds<br/>
                          Status: Hot lead 🔥
                        </Typography>
                      </CardContent>
                    </Card>
                  </Box>
                </motion.div>
              )}

              {/* Tab 3: Call Preparation */}
              {activeTab === 3 && (
                <motion.div
                  key="call"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <Box textAlign="center" py={4}>
                    <Phone sx={{ fontSize: 60, color: '#3b82f6', mb: 3 }} />
                    <Typography variant="h5" fontWeight="bold" color="primary" mb={3}>
                      Ready to Call {hotel?.managerName}?
                    </Typography>
                    
                    <Card sx={{ maxWidth: 500, mx: 'auto', mb: 4 }}>
                      <CardContent>
                        <Typography variant="h6" color="primary" mb={2}>
                          Call Strategy
                        </Typography>
                        <Box textAlign="left">
                          <Typography variant="body2" mb={1}>
                            ✅ Email opened - perfect timing<br/>
                            ✅ Personalized product recommendation ready<br/>
                            ✅ Previous purchase history loaded<br/>
                            ✅ AI agent briefed on {hotel?.hotelName || 'the hotel'}
                          </Typography>
                        </Box>
                      </CardContent>
                    </Card>

                    <motion.div
                      animate={shouldVibrate ? {
                        x: [-2, 2, -2, 2, 0],
                        y: [-1, 1, -1, 1, 0],
                        scale: [1, 1.02, 1, 1.02, 1]
                      } : {}}
                      transition={{
                        duration: 0.5,
                        repeat: shouldVibrate ? Infinity : 0,
                        repeatDelay: 0.3
                      }}
                    >
                      <Button
                        variant="contained"
                        size="large"
                        onClick={handleStartCall}
                        startIcon={<Call />}
                        sx={{
                          background: shouldVibrate 
                            ? 'linear-gradient(45deg, #f59e0b, #d97706)' 
                            : 'linear-gradient(45deg, #3b82f6, #1d4ed8)',
                          '&:hover': {
                            background: shouldVibrate
                              ? 'linear-gradient(45deg, #d97706, #b45309)'
                              : 'linear-gradient(45deg, #1d4ed8, #1e40af)',
                          },
                          fontWeight: 'bold',
                          py: 1.5,
                          px: 4,
                          boxShadow: shouldVibrate 
                            ? '0 0 20px rgba(245, 158, 11, 0.6)' 
                            : undefined,
                          transition: 'all 0.3s ease'
                        }}
                      >
                        {shouldVibrate ? '🔥 Click to Start Call!' : 'Start Call Now'}
                      </Button>
                    </motion.div>
                  </Box>
                </motion.div>
              )}
            </AnimatePresence>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Phone Number Input Dialog */}
      <Dialog
        open={showPhoneInput}
        onClose={() => setShowPhoneInput(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            p: 2
          }
        }}
      >
        <DialogTitle sx={{ 
          background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '12px 12px 0 0'
        }}>
          <Typography variant="h6" fontWeight="bold">
            🎯 Y Combinator Demo - AI Sales Agent
          </Typography>
          <IconButton onClick={() => setShowPhoneInput(false)} sx={{ color: 'white' }}>
            <Close />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Phone sx={{ fontSize: 60, color: '#3b82f6', mb: 2 }} />
            <Typography variant="h6" color="primary" mb={1}>
              Start Your Sales Call Demo
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              (You'll play the hotel manager from {hotel?.hotelName})
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Enter your US phone number to receive the demo call
            </Typography>
          </Box>

          <Box sx={{ mb: 3 }}>
            <TextField
              fullWidth
              label="Your Phone Number (Demo)"
              placeholder="(555) 123-4567"
              value={phoneNumber}
              onChange={(e) => {
                const formatted = formatPhoneInput(e.target.value);
                if (formatted.replace(/\D/g, '').length <= 10) {
                  setPhoneNumber(formatted);
                  setPhoneError('');
                }
              }}
              error={!!phoneError}
              helperText={phoneError || 'Enter your US phone number to receive the demo call'}
              sx={{ 
                '& .MuiInputBase-input': { 
                  fontSize: '18px',
                  textAlign: 'center',
                  letterSpacing: '1px'
                }
              }}
            />
          </Box>

          <Box sx={{ textAlign: 'center' }}>
            <Button
              variant="contained"
              size="large"
              onClick={handlePhoneSubmit}
              disabled={!phoneNumber || phoneNumber.replace(/\D/g, '').length < 10}
              sx={{
                background: 'linear-gradient(45deg, #10b981, #059669)',
                '&:hover': {
                  background: 'linear-gradient(45deg, #059669, #047857)',
                },
                fontWeight: 'bold',
                py: 1.5,
                px: 4,
                borderRadius: 2
              }}
            >
              Start Demo Call
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              You'll play {hotel?.managerName} from {hotel?.hotelName}
            </Typography>
          </Box>

          <Box sx={{ 
            mt: 3, 
            p: 2, 
            background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
            borderRadius: 2,
            border: '1px solid #0ea5e9'
          }}>
            <Typography variant="body2" color="primary" fontWeight="bold" mb={1}>
              📞 What Happens in This Demo:
            </Typography>
            <Typography variant="caption" color="text.secondary">
              • You'll get a live call as {hotel?.managerName} ({hotel?.hotelName})<br/>
              • Our AI agent will pitch a seasonal item ({hotel?.recommendedProduct})<br/>
              • Watch the live voice interaction on-screen
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Call Simulation */}
      <CallSimulation
        open={showCallSimulation}
        onClose={() => {
          setShowCallSimulation(false);
          handleClose();
        }}
        hotel={hotel}
        phoneNumber={validatePhoneNumber(phoneNumber) || undefined}
      />
    </>
  );
};

export default EmailDraftModal; 