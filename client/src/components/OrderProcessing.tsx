import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  Card,
  CardContent,
  LinearProgress,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Button,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import {
  CloudUpload,
  Storage,
  Email,
  LocalShipping,
  CheckCircle,
  Business,
  Notifications,
  Assignment,
  Schedule
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';

interface OrderProcessingProps {
  open: boolean;
  onClose: () => void;
  orderData: any;
  customerData: any;
}

interface ProcessingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  status: 'pending' | 'processing' | 'completed' | 'error';
  duration: number;
  details: string[];
}

const OrderProcessing: React.FC<OrderProcessingProps> = ({ 
  open, 
  onClose, 
  orderData, 
  customerData 
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<ProcessingStep[]>([
    {
      id: 'validation',
      title: 'Order Validation',
      description: 'Validating order details and customer information',
      icon: <Assignment color="primary" />,
      status: 'pending',
      duration: 2000,
      details: [
        'Verifying product availability',
        'Checking customer credit limit',
        'Validating delivery address',
        'Confirming pricing accuracy'
      ]
    },
    {
      id: 'sap',
      title: 'SAP System Integration',
      description: 'Creating sales order in SAP ERP system',
      icon: <Storage color="primary" />,
      status: 'pending',
      duration: 3000,
      details: [
        'Connecting to SAP ERP system',
        'Creating sales order document',
        'Updating inventory levels',
        'Generating order confirmation number'
      ]
    },
    {
      id: 'payment',
      title: 'Payment Processing',
      description: 'Processing payment through Stripe',
      icon: <CloudUpload color="primary" />,
      status: 'pending',
      duration: 2500,
      details: [
        'Charging customer credit card',
        'Generating payment receipt',
        'Updating accounting records',
        'Sending payment confirmation'
      ]
    },
    {
      id: 'notification',
      title: 'Customer Notification',
      description: 'Sending order confirmation to customer',
      icon: <Email color="primary" />,
      status: 'pending',
      duration: 1500,
      details: [
        'Generating order confirmation email',
        'Sending SMS notification',
        'Updating customer portal',
        'Creating delivery tracking link'
      ]
    },
    {
      id: 'logistics',
      title: 'Delivery Scheduling',
      description: 'Coordinating with logistics team',
      icon: <LocalShipping color="primary" />,
      status: 'pending',
      duration: 2000,
      details: [
        'Scheduling delivery route',
        'Assigning delivery truck',
        'Notifying warehouse team',
        'Creating delivery manifest'
      ]
    },
    {
      id: 'sales',
      title: 'Sales Team Notification',
      description: 'Alerting sales department about new order',
      icon: <Notifications color="primary" />,
      status: 'pending',
      duration: 1000,
      details: [
        'Updating sales dashboard',
        'Notifying account manager',
        'Adding to sales pipeline',
        'Scheduling follow-up call'
      ]
    }
  ]);

  const dialogContentRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [autoScrolling, setAutoScrolling] = useState(false);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);

  useEffect(() => {
    if (open) {
      processSteps();
    }
  }, [open]);

  const processSteps = async () => {
    // Start auto-scrolling after a brief delay
    setTimeout(() => {
      setAutoScrolling(true);
      setShowScrollIndicator(true);
    }, 1000);

    for (let i = 0; i < steps.length; i++) {
      setCurrentStep(i);
      
      // Update step to processing
      setSteps(prev => prev.map((step, index) => 
        index === i ? { ...step, status: 'processing' } : step
      ));

      // Auto-scroll to current step with smooth animation
      if (autoScroll && dialogContentRef.current) {
        setAutoScrolling(true);
        
        // Calculate scroll position to center the current step
        const stepElements = dialogContentRef.current.querySelectorAll('.MuiStep-root');
        if (stepElements[i]) {
          const stepElement = stepElements[i] as HTMLElement;
          const containerHeight = dialogContentRef.current.clientHeight;
          const stepTop = stepElement.offsetTop;
          const stepHeight = stepElement.clientHeight;
          
          // Calculate position to center the step in view
          const scrollPosition = stepTop - (containerHeight / 2) + (stepHeight / 2);
          
          dialogContentRef.current.scrollTo({
            top: Math.max(0, scrollPosition),
            behavior: 'smooth'
          });
        }
      }

      // Wait for step duration
      await new Promise(resolve => setTimeout(resolve, steps[i].duration));

      // Update step to completed
      setSteps(prev => prev.map((step, index) => 
        index === i ? { ...step, status: 'completed' } : step
      ));
    }

    // Scroll to completion message when all steps are done
    setTimeout(() => {
      if (dialogContentRef.current) {
        dialogContentRef.current.scrollTo({
          top: dialogContentRef.current.scrollHeight,
          behavior: 'smooth'
        });
        setShowScrollIndicator(false);
      }
    }, 500);
  };

  const getStepIcon = (step: ProcessingStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle sx={{ color: '#10b981' }} />;
      case 'processing':
        return (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            {step.icon}
          </motion.div>
        );
      case 'error':
        return <CheckCircle sx={{ color: '#ef4444' }} />;
      default:
        return step.icon;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#10b981';
      case 'processing': return '#3b82f6';
      case 'error': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const isProcessingComplete = steps.every(step => step.status === 'completed');

  // Reset states when dialog closes
  useEffect(() => {
    if (!open) {
      setCurrentStep(0);
      setAutoScrolling(false);
      setShowScrollIndicator(false);
      setSteps(prev => prev.map(step => ({ ...step, status: 'pending' })));
    }
  }, [open]);

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          minHeight: '80vh'
        }
      }}
    >
      <DialogTitle sx={{ 
        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        color: 'white',
        textAlign: 'center',
        py: 3
      }}>
        <Business sx={{ mr: 2, fontSize: 32 }} />
        <Typography variant="h4" component="span" fontWeight="bold">
          Order Processing Workflow
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ p: 4 }} ref={dialogContentRef}>
        {/* Auto-scroll indicator */}
        {showScrollIndicator && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{ marginBottom: 16 }}
          >
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              p: 2,
              backgroundColor: '#e0f2fe',
              borderRadius: 2,
              border: '1px solid #0284c7',
              mb: 3
            }}>
              <motion.div
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <Typography variant="body2" color="primary" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Schedule sx={{ fontSize: 18 }} />
                  📋 Auto-scrolling through processing workflow...
                </Typography>
              </motion.div>
            </Box>
          </motion.div>
        )}

        {/* Order Summary */}
        <Card sx={{ mb: 4, borderRadius: 2, border: '2px solid #10b981' }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 2, color: '#10b981' }}>
              📋 Processing Order Summary
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography><strong>Customer:</strong> {customerData?.name}</Typography>
              <Typography><strong>Hotel:</strong> {customerData?.hotel}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography><strong>Order Total:</strong> ${orderData?.total}</Typography>
              <Typography><strong>Items:</strong> {orderData?.products?.length} products</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Order ID: ORD-{Date.now().toString().slice(-6)}
            </Typography>
          </CardContent>
        </Card>

        {/* Processing Steps */}
        <Stepper activeStep={currentStep} orientation="vertical">
          {steps.map((step, index) => (
            <Step key={step.id}>
              <StepLabel 
                icon={getStepIcon(step)}
                sx={{
                  '& .MuiStepLabel-label': {
                    color: getStatusColor(step.status),
                    fontWeight: step.status === 'processing' ? 'bold' : 'normal'
                  }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="h6">{step.title}</Typography>
                  <Chip 
                    label={step.status.toUpperCase()}
                    size="small"
                    sx={{ 
                      backgroundColor: getStatusColor(step.status),
                      color: 'white',
                      fontWeight: 'bold'
                    }}
                  />
                </Box>
              </StepLabel>
              <StepContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {step.description}
                </Typography>
                
                {step.status === 'processing' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card sx={{ backgroundColor: '#f0f9ff', borderRadius: 2, mb: 2 }}>
                      <CardContent sx={{ py: 2 }}>
                        <List dense>
                          {step.details.map((detail, detailIndex) => (
                            <motion.div
                              key={detailIndex}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ 
                                duration: 0.3, 
                                delay: detailIndex * 0.2 
                              }}
                            >
                              <ListItem sx={{ py: 0.5 }}>
                                <ListItemIcon sx={{ minWidth: 30 }}>
                                  <motion.div
                                    animate={{ scale: [1, 1.2, 1] }}
                                    transition={{ 
                                      duration: 1, 
                                      repeat: Infinity,
                                      delay: detailIndex * 0.2 
                                    }}
                                  >
                                    <CheckCircle sx={{ fontSize: 16, color: '#3b82f6' }} />
                                  </motion.div>
                                </ListItemIcon>
                                <ListItemText 
                                  primary={detail}
                                  primaryTypographyProps={{ 
                                    variant: 'body2',
                                    color: '#1f2937'
                                  }}
                                />
                              </ListItem>
                            </motion.div>
                          ))}
                        </List>
                        <LinearProgress 
                          sx={{ 
                            mt: 2, 
                            height: 6, 
                            borderRadius: 3,
                            backgroundColor: '#e5e7eb',
                            '& .MuiLinearProgress-bar': {
                              backgroundColor: '#3b82f6'
                            }
                          }} 
                        />
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {step.status === 'completed' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card sx={{ backgroundColor: '#f0fdf4', borderRadius: 2, mb: 2 }}>
                      <CardContent sx={{ py: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <CheckCircle sx={{ color: '#10b981' }} />
                          <Typography variant="body2" fontWeight="bold" color="#065f46">
                            ✅ {step.title} completed successfully
                          </Typography>
                        </Box>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </StepContent>
            </Step>
          ))}
        </Stepper>

        {/* Completion Message */}
        <AnimatePresence>
          {isProcessingComplete && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              {/* Scroll completion indicator */}
              {!showScrollIndicator && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5, duration: 0.4 }}
                  style={{ marginBottom: 16 }}
                >
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    p: 2,
                    backgroundColor: '#f0fdf4',
                    borderRadius: 2,
                    border: '1px solid #10b981',
                    mb: 3
                  }}>
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <Typography variant="body2" color="success.main" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CheckCircle sx={{ fontSize: 18 }} />
                        🎯 Processing workflow completed successfully!
                      </Typography>
                    </motion.div>
                  </Box>
                </motion.div>
              )}

              <Card sx={{ 
                mt: 4, 
                borderRadius: 3, 
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white'
              }}>
                <CardContent sx={{ textAlign: 'center', py: 4 }}>
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <CheckCircle sx={{ fontSize: 60, mb: 2 }} />
                  </motion.div>
                  <Typography variant="h4" fontWeight="bold" gutterBottom>
                    🎉 Order Processing Complete!
                  </Typography>
                  <Typography variant="h6" sx={{ mb: 3, opacity: 0.9 }}>
                    Order has been successfully processed and is ready for delivery
                  </Typography>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <Chip 
                      label="📧 Customer Notified" 
                      sx={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}
                    />
                    <Chip 
                      label="🚚 Delivery Scheduled" 
                      sx={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}
                    />
                    <Chip 
                      label="💳 Payment Processed" 
                      sx={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}
                    />
                    <Chip 
                      label="📊 SAP Updated" 
                      sx={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}
                    />
                  </Box>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Button */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <Button
            variant="contained"
            onClick={onClose}
            disabled={!isProcessingComplete}
            sx={{
              px: 6,
              py: 2,
              fontSize: '1.1rem',
              background: isProcessingComplete 
                ? 'linear-gradient(45deg, #10b981, #059669)' 
                : undefined,
              '&:hover': {
                background: isProcessingComplete 
                  ? 'linear-gradient(45deg, #059669, #047857)' 
                  : undefined,
              }
            }}
          >
            {isProcessingComplete ? 'Complete ✅' : 'Processing...'}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default OrderProcessing; 