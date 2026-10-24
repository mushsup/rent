import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { BikeTask } from '../../types';
import { getErrorMessage } from '../../shared/lib/errors';
import { queryKeys } from '../../shared/lib/queryKeys';
import { deleteBikeTask, fetchBikeTasks, pushBikeTask, saveBikeTask, type BikeTaskInput } from './api';
import { useI18n } from '../../i18n';

export function useBikeTasks(bikeId?: string) {
  return useQuery({
    queryKey: bikeId ? queryKeys.tasks.byBike(bikeId) : queryKeys.tasks.all,
    queryFn: () => fetchBikeTasks(bikeId),
  });
}

export function useSaveBikeTask() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: BikeTaskInput }) => saveBikeTask(id, input),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      if (result.syncWarning) toast.error(t(result.syncWarning));
    },
    onError: (error) => toast.error(`${t('Ошибка сохранения')}: ${t(getErrorMessage(error))}`),
  });
}

export function useDeleteBikeTask() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  return useMutation({
    mutationFn: deleteBikeTask,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      if (result.syncWarning) toast.error(t(result.syncWarning));
    },
    onError: (error) => toast.error(`${t('Ошибка удаления')}: ${t(getErrorMessage(error))}`),
  });
}

export function usePushBikeTask() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  return useMutation({
    mutationFn: pushBikeTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      toast.success(t('Задача отправлена в Google Tasks'));
    },
    onError: (error) => toast.error(`${t('Ошибка синхронизации')}: ${t(getErrorMessage(error))}`),
  });
}

export function useToggleBikeTask() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  return useMutation({
    mutationFn: (task: BikeTask) => saveBikeTask(task.id, {
      bike_id: task.bike_id,
      title: task.title,
      description: task.description || '',
      status: task.status === 'done' ? 'open' : 'done',
      priority: task.priority,
      due_date: task.due_date || null,
    }),
    onMutate: async (task) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
      const snapshots = queryClient.getQueriesData<BikeTask[]>({ queryKey: queryKeys.tasks.all });
      queryClient.setQueriesData<BikeTask[]>({ queryKey: queryKeys.tasks.all }, (tasks) => tasks?.map((item) => item.id === task.id ? { ...item, status: item.status === 'done' ? 'open' : 'done' } : item));
      return { snapshots };
    },
    onSuccess: (result) => { if (result.syncWarning) toast.error(t(result.syncWarning)); },
    onError: (error, _task, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(`${t('Ошибка обновления')}: ${t(getErrorMessage(error))}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all }),
  });
}
