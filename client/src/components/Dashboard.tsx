import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Container,
  Tooltip
} from '@mui/material';
import { motion } from 'framer-motion';
import { Hotel, DashboardMetrics } from '../types';
import EmailDraftModal from './EmailDraftModal';

const sampleHotels: Hotel[] = [
  {
    id: '1',
    hotelName: 'Grand Plaza',
    managerName: 'John Doe',
    lastPurchasedProduct: 'Asiago Cheese Bagel',
    recommendedProduct: 'Blueberry Bagel',
    lastPurchaseDate: '2025-05-12',
    phone: '(925) 325-2609',
    email: 'john.doe@grandplaza.com'
  },
  {
    id: '2',
    hotelName: 'Sunrise Inn',
    managerName: 'Sarah Lee',
    lastPurchasedProduct: 'Banana Muffins',
    recommendedProduct: 'Chocolate Muffins',
    lastPurchaseDate: '2025-05-13',
    phone: '(925) 325-2609',
    email: 'sarah.lee@sunriseinn.com'
  },
  {
    id: '3',
    hotelName: 'Ocean Breeze',
    managerName: 'Michael Tan',
    lastPurchasedProduct: 'Greek Yogurt',
    recommendedProduct: 'Mango Greek Yogurt',
    lastPurchaseDate: '2025-05-14',
    phone: '(925) 325-2609',
    email: 'michael.tan@oceanbreeze.com'
  },
  {
    id: '4',
    hotelName: 'Seaside Suites',
    managerName: 'Emma Green',
    lastPurchasedProduct: 'Classic Croissant',
    recommendedProduct: 'Almond Croissant',
    lastPurchaseDate: '2025-05-10',
    phone: '(925) 325-2609',
    email: 'emma.green@seasidesuites.com'
  },
  {
    id: '5',
    hotelName: 'City Comforts',
    managerName: 'David Wilson',
    lastPurchasedProduct: 'Strawberry Jam',
    recommendedProduct: 'Raspberry Jam',
    lastPurchaseDate: '2025-05-05',
    phone: '(925) 325-2609',
    email: 'david.wilson@citycomforts.com'
  }
];

const Dashboard: React.FC = () => {
  const [metrics] = useState<DashboardMetrics>({
    leadsGenerated: 247,
    leadsContacted: 156,
    leadsClosed: 89
  });

  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  
  // Simplified guidance state - no aggressive animations
  const [showGuidanceTooltip, setShowGuidanceTooltip] = useState(false);
  const [guidanceTimer, setGuidanceTimer] = useState<NodeJS.Timeout | null>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false); // Permanent flag

  // Animation state for row effects
  const [animatingRowId, setAnimatingRowId] = useState<string | null>(null);

  // Start gentle guidance after 5 seconds (only if user hasn't interacted)
  useEffect(() => {
    if (hasUserInteracted) return; // Don't show guidance if user already interacted
    
    const timer = setTimeout(() => {
      setShowGuidanceTooltip(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, [hasUserInteracted]);

  // Reset guidance only on specific interactions (not mouse movement)
  const handleUserInteraction = useCallback(() => {
    console.log('🚫 Hiding guidance - user interacted');
    setShowGuidanceTooltip(false);
    setHasUserInteracted(true); // Permanently mark as interacted
    if (guidanceTimer) {
      clearTimeout(guidanceTimer);
      setGuidanceTimer(null);
    }
  }, [guidanceTimer]);

  // Handle outreach click
  const handleOutreach = (hotel: Hotel) => {
    console.log('🎯 OUTREACH clicked - hiding all guidance');
    handleUserInteraction(); // Hide guidance when user clicks OUTREACH
    
    // Start row animation
    setAnimatingRowId(hotel.id);
    
    // Reset animation after 5 seconds (increased from 3 seconds)
    setTimeout(() => {
      setAnimatingRowId(null);
    }, 5000);
    
    // Delay modal opening to show the animation first
    setTimeout(() => {
      setSelectedHotel(hotel);
      setEmailModalOpen(true);
    }, 2500); // Open modal after 2.5 seconds into the animation (was 1.5s)
  };

  // Simple Outreach Button without aggressive animations
  const SmartOutreachButton = ({ hotel, index }: { hotel: Hotel; index: number }) => {
    const isAnimating = animatingRowId === hotel.id;
    
    const buttonContent = (
      <motion.div
        animate={isAnimating ? { scale: [1, 1.2, 1] } : { scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <Button
          variant="contained"
          onClick={() => handleOutreach(hotel)}
          disabled={isAnimating}
          sx={{
            background: isAnimating 
              ? 'linear-gradient(45deg, #10b981, #059669)' 
              : 'linear-gradient(45deg, #3b82f6, #1d4ed8)',
            fontWeight: 'bold',
            px: 3,
            transition: 'all 0.3s ease',
            '&:hover': {
              background: isAnimating
                ? 'linear-gradient(45deg, #10b981, #059669)'
                : 'linear-gradient(45deg, #1d4ed8, #1e40af)',
              transform: 'translateY(-1px)',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
            },
            '&:disabled': {
              background: 'linear-gradient(45deg, #10b981, #059669)',
              color: 'white',
              opacity: 1
            }
          }}
        >
          {isAnimating ? 'PROCESSING...' : 'OUTREACH'}
        </Button>
      </motion.div>
    );

    // Show tooltip only for the first button and only when guidance is active
    if (index === 0 && showGuidanceTooltip && !hasUserInteracted) {
      return (
        <motion.div
          animate={{
            x: [-1, 1, -1, 1, 0],
            y: [-0.5, 0.5, -0.5, 0.5, 0]
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            repeatDelay: 1.2,
            ease: "easeInOut"
          }}
        >
          <Tooltip 
            title={
              <motion.div
                animate={{
                  scale: [1, 1.02, 1, 1.02, 1]
                }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  repeatDelay: 0.8,
                  ease: "easeInOut"
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  👋 Click any OUTREACH button to start a sales call demo!
                  <Button
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUserInteraction();
                    }}
                    sx={{
                      minWidth: 'auto',
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      ml: 1,
                      color: 'white',
                      '&:hover': {
                        backgroundColor: 'rgba(255,255,255,0.2)'
                      }
                    }}
                  >
                    ×
                  </Button>
                </Box>
              </motion.div>
            }
            open={true}
            arrow
            placement="top"
            sx={{
              '& .MuiTooltip-tooltip': {
                fontSize: '14px',
                fontWeight: 'bold',
                backgroundColor: '#10b981',
                color: 'white',
                boxShadow: '0 4px 20px rgba(16, 185, 129, 0.4)',
                borderRadius: '8px',
                padding: '12px 16px',
                animation: 'pulse 2s infinite',
                maxWidth: 'none'
              },
              '& .MuiTooltip-arrow': {
                color: '#10b981',
              },
              '@keyframes pulse': {
                '0%': {
                  boxShadow: '0 4px 20px rgba(16, 185, 129, 0.4)'
                },
                '50%': {
                  boxShadow: '0 6px 30px rgba(16, 185, 129, 0.7)'
                },
                '100%': {
                  boxShadow: '0 4px 20px rgba(16, 185, 129, 0.4)'
                }
              }
            }}
          >
            {buttonContent}
          </Tooltip>
        </motion.div>
      );
    }

    return buttonContent;
  };

  const MetricCard = ({ title, value, gradient }: { title: string; value: number; gradient: string }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card 
        sx={{ 
          background: gradient,
          color: 'white',
          height: '140px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(59, 130, 246, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 2
        }}
      >
        <CardContent sx={{ textAlign: 'center' }}>
          <Typography variant="h3" component="div" fontWeight="bold">
            {value}
          </Typography>
          <Typography variant="h6" component="div" sx={{ opacity: 0.9 }}>
            {title}
          </Typography>
        </CardContent>
      </Card>
    </motion.div>
  );

  return (
    <Container 
      maxWidth="lg" 
      sx={{ 
        py: 4,
        '@keyframes gradientShift': {
          '0%': {
            backgroundPosition: '0% 50%'
          },
          '50%': {
            backgroundPosition: '100% 50%'
          },
          '100%': {
            backgroundPosition: '0% 50%'
          }
        },
        '@keyframes pulse': {
          '0%': {
            opacity: 0.6
          },
          '50%': {
            opacity: 1
          },
          '100%': {
            opacity: 0.6
          }
        },
        '@keyframes borderPulse': {
          '0%': {
            outlineColor: '#10b981'
          },
          '33%': {
            outlineColor: '#3b82f6'
          },
          '66%': {
            outlineColor: '#06b6d4'
          },
          '100%': {
            outlineColor: '#10b981'
          }
        }
      }}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        <Typography 
          variant="h3" 
          component="h1" 
          gutterBottom 
          sx={{ 
            textAlign: 'center', 
            background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
            fontWeight: 'bold',
            mb: 4
          }}
        >
          US Hotel Food Supplies
        </Typography>

        {/* Metrics Cards */}
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
          gap: 3, 
          mb: 4,
          '@media (max-width: 600px)': {
            gridTemplateColumns: '1fr'
          }
        }}>
          <MetricCard 
            title="Leads Generated" 
            value={metrics.leadsGenerated}
            gradient="linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)"
          />
          <MetricCard 
            title="Leads Contacted" 
            value={metrics.leadsContacted}
            gradient="linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)"
          />
          <MetricCard 
            title="Leads Closed" 
            value={metrics.leadsClosed}
            gradient="linear-gradient(135deg, #10b981 0%, #059669 100%)"
          />
        </Box>

        {/* Hotel Leads Table */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <Paper sx={{ mb: 4, borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ p: 3, background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' }}>
              <Typography variant="h5" component="h2" fontWeight="bold" color="primary">
                Hotel Leads Management
                {showGuidanceTooltip && !hasUserInteracted && (
                  <motion.div
                    animate={{
                      opacity: [0.7, 1, 0.7],
                      scale: [1, 1.02, 1]
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  >
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        color: '#10b981', 
                        fontWeight: 'bold', 
                        mt: 1,
                        opacity: 0.9,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1
                      }}
                    >
                      <motion.span
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          repeatDelay: 2
                        }}
                      >
                        💡
                      </motion.span>
                      Try clicking an OUTREACH button to start a demo
                    </Typography>
                  </motion.div>
                )}
              </Typography>
            </Box>
            
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#f1f5f9' }}>
                    <TableCell><strong>Hotel Name</strong></TableCell>
                    <TableCell><strong>Manager Name</strong></TableCell>
                    <TableCell><strong>Last Purchased Product</strong></TableCell>
                    <TableCell><strong>Recommended Product</strong></TableCell>
                    <TableCell><strong>Last Purchase Date</strong></TableCell>
                    <TableCell align="center"><strong>Action</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sampleHotels.map((hotel, index) => {
                    const isAnimating = animatingRowId === hotel.id;
                    
                    return (
                      <TableRow
                        key={hotel.id}
                        component={motion.tr}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ 
                          opacity: 1, 
                          x: 0,
                          scale: isAnimating ? [1, 0.95, 1] : 1,
                          y: isAnimating ? [0, -5, 0] : 0
                        }}
                        transition={{ 
                          duration: isAnimating ? 5 : 0.4,
                          delay: isAnimating ? 0 : index * 0.1,
                          ease: isAnimating ? "easeInOut" : "easeOut"
                        }}
                        sx={{ 
                          '&:hover': { backgroundColor: '#f8fafc' },
                          position: 'relative',
                          ...(isAnimating && {
                            // Pure outline border only
                            outline: '2px solid #10b981',
                            outlineOffset: '2px',
                            borderRadius: '6px',
                            boxShadow: `
                              0 0 0 1px #3b82f6,
                              0 0 10px rgba(16, 185, 129, 0.3),
                              0 0 20px rgba(59, 130, 246, 0.2)
                            `,
                            animation: 'borderPulse 2s ease-in-out infinite'
                          })
                        }}
                      >
                        <TableCell>{hotel.hotelName}</TableCell>
                        <TableCell>{hotel.managerName}</TableCell>
                        <TableCell>{hotel.lastPurchasedProduct}</TableCell>
                        <TableCell>
                          <Typography color="primary" fontWeight="medium">
                            {hotel.recommendedProduct}
                          </Typography>
                        </TableCell>
                        <TableCell>{hotel.lastPurchaseDate}</TableCell>
                        <TableCell align="center">
                          <SmartOutreachButton hotel={hotel} index={index} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </motion.div>
      </motion.div>

      {/* Email Draft Modal */}
      <EmailDraftModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        hotel={selectedHotel}
      />
    </Container>
  );
};

export default Dashboard; 