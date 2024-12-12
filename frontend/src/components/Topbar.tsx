//import React from 'react';
import { styled } from '@mui/material/styles';
import { AppBar, Toolbar, IconButton, Box } from '@mui/material';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import Logo from "../assets/Logo.svg";

export default function AppBarComponent() {

    // Custom styled AppBar
    const StyledAppBar = styled(AppBar)(({ theme }) => ({
        background: '#cfe2f3',
        boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)',
        width: '100%',
        position: 'fixed',
        top: 0,
        left: 0,
    }));

    return (
        <StyledAppBar position="static">
            <Toolbar sx={{ position: 'relative', padding: '0 16px', minHeight: '64px' }}>
                {/* Logo on the left */}
                <Box sx={{ position: 'absolute', left: '16px', display: 'flex', alignItems: 'center' }}>
                    <img
                        src={Logo}
                        alt="Logo"
                        style={{
                            width: '240px',
                            height: 'auto',
                        }}
                    />
                </Box>

                {/* Icons in the center */}
                <Box sx={{
                    position: 'absolute',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: '20px',
                }}>
                    <IconButton>
                        <HomeRoundedIcon fontSize="large" color="secondary" />
                    </IconButton>
                    <IconButton>
                        <CalculateOutlinedIcon fontSize="large" color="secondary" />
                    </IconButton>
                </Box>
            </Toolbar>
        </StyledAppBar>
    );
}
