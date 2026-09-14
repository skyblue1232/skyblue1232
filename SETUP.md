# Setup

1. GitHub 사용자명과 같은 public repository를 만듭니다.
   - 현재 사용자명 기준: `skyblue1232/skyblue1232`
2. 이 ZIP 안의 파일과 폴더를 repository root에 그대로 복사합니다.
3. GitHub의 `Actions` 탭에서 `Generate profile visuals`를 한 번 수동 실행합니다.
4. 실행이 끝나면 아래 파일들이 자동으로 생깁니다.
   - `profile-3d-contrib/*.svg`
   - `assets/github-snake.svg`
   - `assets/github-snake-dark.svg`
5. README를 열면 애니메이션 배너 + 3D contribution + snake가 보입니다.

## 왜 외부 이미지 링크를 최소화했나?

외부 통계/배너 서버는 rate limit, 배포 중단, 캐시 문제로 프로필에서 깨질 수 있습니다.
이 구성은 메인 애니메이션(`assets/hero.svg`)을 repository 안에 직접 넣고,
3D contribution과 snake 역시 GitHub Actions가 repository에 SVG 파일을 생성해 저장합니다.
따라서 프로필이 외부 이미지 서비스에 덜 의존합니다.
