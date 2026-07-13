/**
 * Navigation param lists — screen params ARE the navigation state; screens
 * derive everything from `route.params` instead of duplicating it in local
 * state (minimal-state rule).
 */
import type { NavigatorScreenParams } from '@react-navigation/native';

/* eslint-disable @typescript-eslint/consistent-type-definitions --
   React Navigation param lists must be type aliases: interfaces lack the
   implicit index signature required by ParamListBase. */

export type MainTabParamList = {
  TodosTab: undefined;
  SettingsTab: undefined;
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList>;
  /** Design-system gallery — registered in dev builds only. */
  DesignSystem: undefined;
};
