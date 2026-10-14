# #6 프로젝트 전용 GitHub 인증

- 이슈: https://github.com/sirloinbh/workout-memo/issues/6
- 브랜치: chore/6-project-github-auth

## 작업 커밋: chore: 프로젝트 전용 GitHub 인증 환경 분리 (#6)

VS Code 환경·터미널 프로필, gh 래퍼, 계정B 실행 스크립트, 로컬 Git helper를 전용 설정 폴더에 연결했다. 공유 키체인의 활성 계정 변화에도 명시적인 sirloinbh 계정 토큰만 프로세스 메모리에서 사용한다. 기본 gh 설정과 전역 Git 설정은 보존한다. 바탕화면 실행 파일은 원본을 .local에 백업하고 프로젝트 경로를 적용한 독립 사본으로 설치했다. Git helper와 터미널 초기화 스크립트도 사용자 설정 폴더의 사본을 사용해 브랜치 변경에 영향을 받지 않는다.

관련 동작 테스트 8개를 구현과 함께 작성·실행해 pass 8, fail 0, skip 0을 확인했다. 설정 경로·명시적 계정·상속 토큰 교체·인자·실패 코드·Git stdin·환경 복원·다른 프로젝트 분기·터미널 함수를 검증한다. 처음에는 여러 gh 실행 파일 선택 오류로 실패했으며 첫 실행 파일 선택으로 수정 후 통과했다. 실제 CLI api user와 Git helper 토큰의 소유자도 sirloinbh인지 인증값 출력 없이 확인했다. Git helper 표시 username은 x-access-token이며 토큰의 실제 계정을 별도로 확인했다. 원본·설치본 SHA-256 일치를 확인했다. 앱 코드·DB·AWS 배포는 변경하지 않는다. 병합은 사용자가 직접 수행한다.
