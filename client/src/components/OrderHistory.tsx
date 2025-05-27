import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent
} from '@mui/material';
import {
  Receipt
} from '@mui/icons-material';

interface OrderHistoryProps {
  orders?: any[];
}

const OrderHistory: React.FC<OrderHistoryProps> = ({ orders }) => {
  return (
    <Card sx={{ mt: 2, opacity: 0.7 }}>
      <CardContent>
        <Box display="flex" alignItems="center" gap={1}>
          <Receipt color="disabled" />
          <Typography variant="h6" color="text.secondary">
            Order History
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Order history functionality has been removed.
        </Typography>
      </CardContent>
    </Card>
  );
};

export default OrderHistory; 