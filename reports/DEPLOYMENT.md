# 배포 기록

## 2026-08-10 - Vercel 초기 공개 배포

### 발생한 문제

첫 배포는 성공 로그와 URL을 반환했지만 루트 주소가 `404 NOT_FOUND`였습니다.

### 원인

Vercel의 무프레임워크 자동 감지가 저장소의 `public/` 폴더를 출력 디렉터리로 선택했습니다. 이 프로젝트의 실행 진입점 `index.html`은 저장소 루트에 있으므로, `public/`만 배포하면 사이트 진입점과 `src/`, `styles.css`가 누락됩니다.

### 해결

`vercel.json`에 다음 설정을 고정했습니다.

```json
{
  "framework": null,
  "outputDirectory": "."
}
```

재배포 후에는 고정 별칭의 HTTP 200, 제목, 4개 화면, 모바일 가로 넘침, 콘솔·페이지 오류를 다시 확인합니다.

### 재발 방지

- 배포 로그의 성공 여부만으로 완료 판정하지 않습니다.
- 고정 URL에 직접 HTTP 요청을 보냅니다.
- 배포 URL을 대상으로 브라우저 스모크 테스트를 다시 실행합니다.

## 2026-08-10 - 발표자료 경로 추가

- 관객 덱: `/presentation/index.html`
- 발표자 대본 화면: `/presenter/index.html`
- 관객 덱과 대본 번들은 분리되어 있으며, 발표자 화면만 `script-data.js`를 읽습니다.
- 로컬 오프라인 실행에서도 iframe이 폴더 목록을 열지 않도록 `presentation/index.html`을 명시합니다.
- Vercel `cleanUrls`는 `false`로 둡니다. `/presentation`으로 확장자를 제거하면 상대 CSS·JS 경로가 루트로 해석되어 화면이 깨집니다.
- 재배포 후 루트·관객 덱·발표자 화면 세 경로를 각각 HTTP 200과 실브라우저로 확인합니다.
