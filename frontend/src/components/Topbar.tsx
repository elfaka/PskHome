//import React from 'react';
import {styled} from '@mui/material/styles';
import Toolbar from '@mui/material/Toolbar';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import Logo from "../assets/Logo.svg";
export default function Topbar() {
    const StyledTopbar = styled(Toolbar)(({theme}) => ({
        display: 'flex', // 내부 요소를 플렉스 박스로 정렬
        justifyContent: 'space-between', // 자식 요소 간의 공간을 균등하게 배치 (좌우 정렬)
        alignItems: 'center', // 자식 요소를 수직 중앙에 정렬
        borderRadius: '8px', // 테두리를 8px 둥글게 설정
        backdropFilter: 'blur(24px)', // 배경에 블러 효과를 적용
        backgroundColor: '#FFFFFF', // 배경색을 파란색으로 설정
        color: 'white', // 텍스트 색상을 흰색으로 설정
        position: 'sticky', // 스크롤 시에도 상단에 고정되도록 설정
        top: 0, // 요소의 기준점을 상단으로 설정 (position: sticky와 함께 사용)
        zIndex: 1000, // 다른 요소들 위에 렌더링될 수 있도록 레이어 우선순위 설정
        boxShadow: '0 2px 5px rgba(0, 0, 0, 1)', // 요소에 그림자 효과 추가
        width: '50%', // 가로 길이를 화면의 1/3로 설정
        margin: '0 auto', // 요소를 수평으로 중앙 정렬
        [
            theme
                .breakpoints
                .down('sm')
        ]: { // 반응형: 화면이 작은 경우의 스타일 설정
            width: '80%', // 작은 화면에서는 가로 길이를 화면의 80%로 설정
        }
    }));
    return (
        <StyledTopbar>
            {/* Left Section: Logo */}
            <div
                style={{
                    gap: '15px'
                }}>
                <img src={Logo} />
            </div>
            {/* Center Section: Navigation */}
            <div
                style={{
                    gap: '15px'
                }}>
                <HomeRoundedIcon fontSize="large" color="secondary"/>
                <CalculateOutlinedIcon fontSize="large" color="secondary"/>
            </div>

            {/* Right Section: User Info */}
            <div>
                <button
                    style={{
                        backgroundColor: '#DEDEDE',
                        color: 'black',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '5px 10px',
                        cursor: 'pointer'
                    }}>
                    Login
                </button>
            </div>
        </StyledTopbar>
    );
}