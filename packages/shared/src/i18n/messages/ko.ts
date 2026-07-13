import type { MessageKey } from './en';

/** Korean catalog. Must define exactly the keys of the English catalog. */
export const ko: Record<MessageKey, string> = {
  'app.title': '모바일 보일러플레이트',

  'tab.todos': '할 일',
  'tab.settings': '설정',

  'common.loading': '불러오는 중…',
  'common.retry': '다시 시도',
  'common.cancel': '취소',
  'common.delete': '삭제',
  'common.close': '닫기',
  'common.add': '추가',

  'offline.banner': '오프라인 상태입니다. 마지막으로 저장된 데이터를 표시합니다.',

  'boot.preparing': '준비하고 있어요…',
  'boot.ad.label': '광고',
  'boot.ad.skip': '광고 건너뛰기',

  'maintenance.title': '점검 중입니다',
  'maintenance.defaultMessage':
    '서비스 점검으로 잠시 이용이 어렵습니다. 잠시 후 다시 시도해 주세요.',

  'update.force.title': '업데이트가 필요해요',
  'update.force.body': '이 버전은 더 이상 지원되지 않습니다. 계속하려면 업데이트해 주세요.',
  'update.optional.title': '업데이트 안내',
  'update.ota.body': '새 버전({version})이 준비되었어요. 스토어 방문 없이 바로 적용됩니다.',
  'update.store.body': '스토어에 새 버전({version})이 있습니다.',
  'update.action.ota': '업데이트 후 재시작',
  'update.action.store': '스토어로 이동',
  'update.action.later': '나중에',
  'update.downloading': '업데이트 다운로드 중…',

  'todos.title': '할 일',
  'todos.createPlaceholder': '무엇을 해야 하나요?',
  'todos.createSubmit': '할 일 추가',
  'todos.createLabel': '새 할 일 제목',
  'todos.empty': '아직 비어 있어요. 위에서 첫 할 일을 추가해 보세요.',
  'todos.loadFailed': '할 일을 불러오지 못했습니다.',
  'todos.filterLabel': '상태 필터',
  'todos.filter.all': '전체',
  'todos.filter.open': '진행 중',
  'todos.filter.done': '완료',
  'todos.status.open': '진행 중',
  'todos.status.done': '완료',
  'todos.toggleStatus': '"{title}" 항목을 {status} 상태로 변경',
  'todos.deleteTodo': '"{title}" 삭제',
  'todos.endReached': '마지막 항목까지 확인했어요.',
  'todos.loadingMore': '더 불러오는 중…',

  'settings.title': '설정',
  'settings.language': '언어',
  'settings.language.system': '기기 언어 따르기',
  'settings.appearance': '화면',
  'settings.theme': '테마',
  'settings.theme.system': '기기 설정 따르기',
  'settings.theme.light': '라이트',
  'settings.theme.dark': '다크',
  'settings.design': '디자인',
  'settings.design.a': '디자인 A (심미성)',
  'settings.design.b': '디자인 B (시인성)',
  'settings.developer': '개발자',
  'settings.designSystem': '디자인 시스템 갤러리',
  'settings.about': '정보',
  'settings.appVersion': '앱 버전',
  'settings.environment': '환경',
  'settings.checkUpdate': '업데이트 확인',
  'settings.upToDate': '최신 버전을 사용하고 있어요.',

  'designSystem.title': '디자인 시스템',
  'designSystem.description':
    '모든 토큰과 컴포넌트를 한 화면에서 확인합니다. 테마·디자인·언어는 설정에서 전환하세요.',
  'designSystem.colors': '컬러 토큰',
  'designSystem.typography': '타이포그래피',
  'designSystem.buttons': '버튼',
  'designSystem.formFields': '입력 필드',
  'designSystem.feedback': '피드백',
  'designSystem.dataDisplay': '데이터 표시',

  'error.validation': '요청에 잘못된 데이터가 포함되어 있습니다.',
  'error.notFound': '요청한 리소스를 찾을 수 없습니다.',
  'error.unauthorized': '이 작업을 수행할 권한이 없습니다.',
  'error.upgradeRequired': '지원이 종료된 앱 버전입니다. 앱을 업데이트해 주세요.',
  'error.internal': '예기치 못한 오류가 발생했습니다. 다시 시도해 주세요.',
  'error.network': '네트워크 오류입니다. 연결을 확인하고 다시 시도해 주세요.',
};
