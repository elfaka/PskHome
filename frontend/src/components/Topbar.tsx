import React from 'react';
import { styled } from '@mui/material/styles';
import { Drawer, IconButton } from '@mui/material';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import Logo from "../assets/Logo.svg";

export default function Sidebar() {

    // Custom styled drawer (sidebar)
    const StyledDrawer = styled(Drawer)(({ theme }) => ({
        width: 240,  // Sidebar width
        flexShrink: 0,
        '& .MuiDrawer-paper': {
            width: 240, // Sidebar paper width
            background: '#cfe2f3',
            padding: theme.spacing(2),
            display: 'flex',
            flexDirection: 'column',
            //justifyContent: 'center',
            boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)',
        }
    }));

    return (
        <StyledDrawer
            variant="permanent" // This makes the sidebar permanent
            anchor="left" // This positions the sidebar on the left side
        >
            <div>
                <img
                    src={Logo}
                    alt="Logo"
                    style={{
                        width: '200px',
                        height: 'auto',
                        marginBottom: '20px',
                    }}
                />
                <IconButton
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                    }}
                >
                    <HomeRoundedIcon fontSize="large" color="secondary" />
                    <CalculateOutlinedIcon fontSize="large" color="secondary" />
                </IconButton>
            </div>
        </StyledDrawer>
    );
}
