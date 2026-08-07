import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/navigation/BackButton';
import { CHECKLIST_CATEGORIES, categoryById } from '@/constants/checklist';
import { useSetWeddingDate } from '@/hooks/useDashboard';
import { useChecklist, type ResolvedTask } from '@/hooks/useChecklist';
import { getErrorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/useTheme';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Amber rather than the destructive red — an overdue task is a nudge, not an error. */
const PAST_DUE_COLOR = '#B4530A';

/** "August 2026" — avoids relying on Intl locale data on-device. */
function monthLabel(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "Jul 18, 2027" for the wedding-date line. */
function shortDate(date: Date): string {
  return `${MONTHS[date.getMonth()].slice(0, 3)} ${date.getDate()}, ${date.getFullYear()}`;
}

/** "2027-07-18" for the date input, matching what Supabase stores. */
function isoDateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

interface Group {
  id: string;
  label: string;
  tasks: ResolvedTask[];
}

export default function ChecklistScreen() {
  const { editorial } = useTheme();
  const {
    tasks,
    completedCount,
    totalCount,
    weddingDate,
    hydrated,
    toggleTask,
    addTask,
    deleteTask,
    resetChecklist,
  } = useChecklist();

  const [groupBy, setGroupBy] = useState<'category' | 'month'>('category');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [monthFilter, setMonthFilter] = useState<string | null>(null);
  const [openTaskKey, setOpenTaskKey] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);

  // Without a wedding date every task's due month is null, so the month view
  // and date line have nothing to show (see the no-date decision in useChecklist).
  const hasDate = weddingDate !== null;
  const effectiveGroupBy = hasDate ? groupBy : 'category';

  const visibleTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (!showCompleted && task.done) return false;
      if (needle && !task.title.toLowerCase().includes(needle)) return false;
      if (monthFilter && (!task.dueMonth || monthKey(task.dueMonth) !== monthFilter)) return false;
      return true;
    });
  }, [tasks, showCompleted, query, monthFilter]);

  /** Every month that has at least one task, oldest first — powers both the
   *  month accordions and the filter sheet's radio list. */
  const allMonths = useMemo(() => {
    const seen = new Map<string, Date>();
    for (const task of tasks) {
      if (task.dueMonth) seen.set(monthKey(task.dueMonth), task.dueMonth);
    }
    return [...seen.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, date]) => ({ key, date }));
  }, [tasks]);

  const groups: Group[] = useMemo(() => {
    if (effectiveGroupBy === 'category') {
      return CHECKLIST_CATEGORIES.map((category) => ({
        id: category.id,
        label: category.label,
        tasks: visibleTasks.filter((t) => t.categoryId === category.id),
      })).filter((g) => g.tasks.length > 0);
    }
    return allMonths
      .map(({ key, date }) => ({
        id: key,
        label: monthLabel(date),
        tasks: visibleTasks.filter((t) => t.dueMonth && monthKey(t.dueMonth) === key),
      }))
      .filter((g) => g.tasks.length > 0);
  }, [effectiveGroupBy, visibleTasks, allMonths]);

  const toggleGroup = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Resolved from the live list rather than held in state, so ticking a task
  // inside the detail sheet re-renders it instead of showing a stale copy.
  const openTask = tasks.find((t) => t.key === openTaskKey) ?? null;

  const confirmDelete = (task: ResolvedTask) =>
    Alert.alert(
      'Delete task?',
      task.custom
        ? `“${task.title}” will be removed.`
        : `“${task.title}” will be hidden. Resetting the checklist brings it back.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteTask(task.key, task.custom);
            setOpenTaskKey(null);
          },
        },
      ],
    );

  const confirmReset = () =>
    Alert.alert('Reset checklist?', 'Every task will be marked as not done. Tasks you added stay.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: resetChecklist },
    ]);

  if (!hydrated) {
    return (
      <SafeAreaView className="flex-1 bg-ed-bg">
        <View className="px-4 pt-2">
          <BackButton />
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={editorial.secondary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-ed-bg">
      {/* Header */}
      <View className="border-b border-ed-outline-variant px-4 pb-3 pt-2">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <View className="flex-row items-center rounded-full bg-ed-surface-container px-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search tasks"
              onPress={() => {
                setSearchOpen((open) => !open);
                setQuery('');
              }}
              className="h-10 w-10 items-center justify-center"
            >
              <Ionicons name="search" size={18} color={editorial.onSurface} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Filter tasks"
              onPress={() => setFiltersOpen(true)}
              className="h-10 w-10 items-center justify-center"
            >
              <Ionicons name="options-outline" size={18} color={editorial.onSurface} />
              {showCompleted || monthFilter ? (
                <View
                  className="absolute right-1.5 top-2 h-2 w-2 rounded-full"
                  style={{ backgroundColor: editorial.secondary }}
                />
              ) : null}
            </Pressable>
          </View>
        </View>

        <Text className="mt-2 font-inter-bold text-screen-title text-ed-on-surface">Checklist</Text>
        <Text className="mt-0.5 font-inter text-body-sm text-ed-on-surface-variant">
          {completedCount} of {totalCount} completed
        </Text>

        {searchOpen ? (
          <View className="mt-3 flex-row items-center rounded-full border border-ed-outline-variant bg-ed-surface px-4">
            <Ionicons name="search" size={16} color={editorial.onSurfaceVariant} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              placeholder="Search tasks"
              placeholderTextColor={editorial.onSurfaceVariant}
              className="ml-2 flex-1 py-2.5 font-inter text-body-sm text-ed-on-surface"
            />
          </View>
        ) : null}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="pb-8" showsVerticalScrollIndicator={false}>
        {/* Always shown, and always tappable: without a date there are no due
            dates and no month view, so this is the way to unlock both. */}
        <Pressable onPress={() => setDateOpen(true)} accessibilityRole="button" className="px-5 pt-4">
          <Text className="font-inter text-body-sm text-ed-on-surface">
            Based on your wedding date:{' '}
            <Text className="font-inter-semibold underline">
              {hasDate ? shortDate(weddingDate) : 'Add a date'}
            </Text>
          </Text>
        </Pressable>

        {/* By category / By month — always visible so the month view is
            discoverable; picking it without a date prompts for one below
            rather than silently falling back to categories. */}
        <View
          className="mx-5 mt-4 flex-row rounded-full p-1"
          style={{ backgroundColor: editorial.surfaceContainer }}
        >
          {(['category', 'month'] as const).map((mode) => {
            const active = groupBy === mode;
            return (
              <Pressable
                key={mode}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setGroupBy(mode)}
                className="flex-1 items-center rounded-full py-2.5"
                style={{
                  backgroundColor: active ? editorial.surface : 'transparent',
                  borderWidth: active ? 1 : 0,
                  borderColor: editorial.onSurface,
                }}
              >
                <Text
                  className={`text-body-sm ${
                    active
                      ? 'font-inter-bold text-ed-on-surface'
                      : 'font-inter text-ed-on-surface-variant'
                  }`}
                >
                  {mode === 'category' ? 'By category' : 'By month'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Groups */}
        <View className="mt-5">
          {groupBy === 'month' && !hasDate ? (
            <View className="items-center px-8 py-14">
              <Ionicons name="calendar-outline" size={28} color={editorial.onSurfaceVariant} />
              <Text className="mt-3 text-center font-inter-bold text-body text-ed-on-surface">
                Add your wedding date
              </Text>
              <Text className="mt-1.5 text-center font-inter text-body-sm leading-5 text-ed-on-surface-variant">
                Due dates are worked out from your wedding day, so the month view needs one first.
              </Text>
              <Pressable
                onPress={() => setDateOpen(true)}
                accessibilityRole="button"
                className="mt-5 rounded-full px-5 py-3"
                style={{ backgroundColor: editorial.secondary }}
              >
                <Text className="font-inter-bold text-body-sm text-white">Set wedding date</Text>
              </Pressable>
            </View>
          ) : groups.length === 0 ? (
            <Text className="px-5 py-16 text-center font-inter text-body-sm text-ed-on-surface-variant">
              {query.trim()
                ? `No tasks match “${query.trim()}”.`
                : 'Nothing left here. Turn on “Show completed” to see what you have ticked off.'}
            </Text>
          ) : (
            groups.map((group) => (
              <ChecklistGroup
                key={group.id}
                group={group}
                grouping={effectiveGroupBy}
                open={expanded.has(group.id)}
                onToggleOpen={() => toggleGroup(group.id)}
                onToggleTask={toggleTask}
                onDeleteTask={confirmDelete}
                onOpenTask={(task) => setOpenTaskKey(task.key)}
              />
            ))
          )}
        </View>

        {completedCount > 0 ? (
          <Pressable
            onPress={confirmReset}
            accessibilityRole="button"
            className="mt-6 flex-row items-center justify-center gap-2"
          >
            <Ionicons name="refresh" size={16} color={editorial.onSurface} />
            <Text className="font-inter-semibold text-body-sm text-ed-on-surface underline">
              Reset checklist
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {/* Add task */}
      <Pressable
        onPress={() => setAddOpen(true)}
        accessibilityRole="button"
        className="flex-row items-center justify-between border-t border-ed-outline-variant px-5 py-4"
      >
        <Text className="font-inter-semibold text-body-sm" style={{ color: editorial.secondary }}>
          Add task
        </Text>
        <Ionicons name="add-circle-outline" size={26} color={editorial.secondary} />
      </Pressable>

      <FiltersModal
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        showCompleted={showCompleted}
        onShowCompletedChange={setShowCompleted}
        months={allMonths}
        monthFilter={monthFilter}
        onMonthFilterChange={setMonthFilter}
        resultCount={visibleTasks.length}
        monthsSelectable={hasDate}
      />

      <WeddingDateModal
        visible={dateOpen}
        weddingDate={weddingDate}
        onClose={() => setDateOpen(false)}
      />

      <TaskDetailModal
        task={openTask}
        onClose={() => setOpenTaskKey(null)}
        onToggle={() => openTask && toggleTask(openTask.key)}
        onDelete={() => openTask && confirmDelete(openTask)}
      />

      <AddTaskModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={(title, categoryId) => {
          addTask({ title, categoryId, monthsBefore: null });
          setAddOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

function ChecklistGroup({
  group,
  grouping,
  open,
  onToggleOpen,
  onToggleTask,
  onDeleteTask,
  onOpenTask,
}: {
  group: Group;
  grouping: 'category' | 'month';
  open: boolean;
  onToggleOpen: () => void;
  onToggleTask: (key: string) => void;
  onDeleteTask: (task: ResolvedTask) => void;
  onOpenTask: (task: ResolvedTask) => void;
}) {
  const { editorial } = useTheme();
  const category = grouping === 'category' ? categoryById(group.id) : undefined;
  const doneCount = group.tasks.filter((t) => t.done).length;

  return (
    <View className="border-b border-ed-outline-variant">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggleOpen}
        className="flex-row items-center px-5 py-4"
      >
        {category ? (
          <Ionicons name={category.icon} size={22} color={category.color} style={{ marginRight: 12 }} />
        ) : null}
        <Text className="font-inter-bold text-body text-ed-on-surface">{group.label}</Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={editorial.onSurface}
          style={{ marginLeft: 6 }}
        />
        <View className="flex-1" />
        <Text className="font-inter text-body-sm text-ed-on-surface-variant">
          {doneCount} / {group.tasks.length}
        </Text>
      </Pressable>

      {open ? (
        <View className="pb-2">
          {group.tasks.map((task) => (
            <TaskRow
              key={task.key}
              task={task}
              onToggle={() => onToggleTask(task.key)}
              onDelete={() => onDeleteTask(task)}
              onOpen={() => onOpenTask(task)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function TaskRow({
  task,
  onToggle,
  onDelete,
  onOpen,
}: {
  task: ResolvedTask;
  onToggle: () => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const { editorial } = useTheme();

  return (
    <Swipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${task.title}`}
          style={{ width: 80, backgroundColor: '#D92D20', alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
        </Pressable>
      )}
    >
      {/* Opaque via inline style rather than a class: the row is a child of a
          Reanimated view, and it must fully cover the red action underneath. */}
      <View
        className="flex-row items-center py-2.5 pl-5 pr-3"
        style={{ backgroundColor: editorial.bg }}
      >
        <Pressable
          onPress={onToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: task.done }}
          accessibilityLabel={task.title}
          hitSlop={8}
          className="h-6 w-6 items-center justify-center rounded-full border-2"
          style={{
            borderColor: task.done ? editorial.secondary : editorial.outline,
            backgroundColor: task.done ? editorial.secondary : 'transparent',
          }}
        >
          {task.done ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
        </Pressable>

        <Pressable onPress={onOpen} className="ml-3 flex-1 flex-row items-center">
          <View className="flex-1 pr-2">
            <Text
              className="font-inter text-body-sm leading-5"
              style={{
                color: task.done ? editorial.onSurfaceVariant : editorial.onSurface,
                textDecorationLine: task.done ? 'line-through' : 'none',
              }}
            >
              {task.title}
            </Text>
            {task.dueDate ? (
              <Text className="mt-0.5 font-inter text-caption">
                {task.pastDue ? (
                  <Text style={{ color: PAST_DUE_COLOR }}>Past due · </Text>
                ) : null}
                <Text style={{ color: editorial.onSurfaceVariant }}>
                  Due {shortDate(task.dueDate)}
                </Text>
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={editorial.onSurface} />
        </Pressable>
      </View>
    </Swipeable>
  );
}

function TaskDetailModal({
  task,
  onClose,
  onToggle,
  onDelete,
}: {
  task: ResolvedTask | null;
  onClose: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { editorial } = useTheme();
  const category = task ? categoryById(task.categoryId) : undefined;

  return (
    <Modal
      visible={task !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-ed-bg">
        <View className="flex-row items-center justify-between border-b border-ed-outline-variant px-5 py-4">
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text className="font-inter text-body-sm text-ed-on-surface">Close</Text>
          </Pressable>
          <Text className="font-inter-bold text-body text-ed-on-surface">Task</Text>
          <View style={{ width: 52 }} />
        </View>

        {task ? (
          <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8 pt-6">
            <Text className="font-inter-bold text-screen-title text-ed-on-surface">{task.title}</Text>

            <View className="mt-4 flex-row flex-wrap items-center gap-2">
              {category ? (
                <View className="flex-row items-center gap-1.5 rounded-full bg-ed-surface-container px-3 py-1.5">
                  <Ionicons name={category.icon} size={14} color={category.color} />
                  <Text className="font-inter-semibold text-caption text-ed-on-surface">
                    {category.label}
                  </Text>
                </View>
              ) : null}
              {task.dueDate ? (
                <View
                  className="rounded-full px-3 py-1.5"
                  style={{
                    backgroundColor: task.pastDue ? `${PAST_DUE_COLOR}1F` : editorial.surfaceContainer,
                  }}
                >
                  <Text
                    className="font-inter-semibold text-caption"
                    style={{ color: task.pastDue ? PAST_DUE_COLOR : editorial.onSurface }}
                  >
                    {task.pastDue ? 'Past due · ' : ''}Due {shortDate(task.dueDate)}
                  </Text>
                </View>
              ) : null}
            </View>

            <Pressable
              onPress={onToggle}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: task.done }}
              className="mt-8 flex-row items-center gap-3"
            >
              <View
                className="h-7 w-7 items-center justify-center rounded-full border-2"
                style={{
                  borderColor: task.done ? editorial.secondary : editorial.outline,
                  backgroundColor: task.done ? editorial.secondary : 'transparent',
                }}
              >
                {task.done ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
              </View>
              <Text className="font-inter text-body text-ed-on-surface">
                {task.done ? 'Done' : 'Mark as done'}
              </Text>
            </Pressable>

            <Pressable
              onPress={onDelete}
              accessibilityRole="button"
              className="mt-8 flex-row items-center gap-2"
            >
              <Ionicons name="trash-outline" size={18} color={PAST_DUE_COLOR} />
              <Text className="font-inter-semibold text-body-sm" style={{ color: PAST_DUE_COLOR }}>
                Delete task
              </Text>
            </Pressable>
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function FiltersModal({
  visible,
  onClose,
  showCompleted,
  onShowCompletedChange,
  months,
  monthFilter,
  onMonthFilterChange,
  resultCount,
  monthsSelectable,
}: {
  visible: boolean;
  onClose: () => void;
  showCompleted: boolean;
  onShowCompletedChange: (value: boolean) => void;
  months: { key: string; date: Date }[];
  monthFilter: string | null;
  onMonthFilterChange: (value: string | null) => void;
  resultCount: number;
  monthsSelectable: boolean;
}) {
  const { editorial } = useTheme();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-ed-bg">
        <View className="flex-row items-center justify-between border-b border-ed-outline-variant px-5 py-4">
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text className="font-inter text-body-sm text-ed-on-surface">Cancel</Text>
          </Pressable>
          <Text className="font-inter-bold text-body text-ed-on-surface">Filters</Text>
          <View style={{ width: 52 }} />
        </View>

        <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8 pt-5">
          <Text className="font-inter-bold text-card-title text-ed-on-surface">Status</Text>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: showCompleted }}
            onPress={() => onShowCompletedChange(!showCompleted)}
            className="mt-3 flex-row items-center gap-3"
          >
            <View
              className="h-6 w-6 items-center justify-center rounded-md border-2"
              style={{
                borderColor: showCompleted ? editorial.secondary : editorial.outline,
                backgroundColor: showCompleted ? editorial.secondary : 'transparent',
              }}
            >
              {showCompleted ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
            </View>
            <Text className="font-inter text-body-sm text-ed-on-surface">Show completed</Text>
          </Pressable>

          {monthsSelectable ? (
            <>
              <Text className="mt-8 font-inter-bold text-card-title text-ed-on-surface">Due date</Text>
              <RadioRow
                label="All months"
                selected={monthFilter === null}
                onPress={() => onMonthFilterChange(null)}
              />
              {months.map(({ key, date }) => (
                <RadioRow
                  key={key}
                  label={monthLabel(date)}
                  selected={monthFilter === key}
                  onPress={() => onMonthFilterChange(key)}
                />
              ))}
            </>
          ) : null}
        </ScrollView>

        <View className="border-t border-ed-outline-variant px-5 py-4">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            className="items-center rounded-full py-4"
            style={{ backgroundColor: editorial.secondary }}
          >
            <Text className="font-inter-bold text-body-sm text-white">
              See {resultCount} task{resultCount === 1 ? '' : 's'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function RadioRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { editorial } = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className="mt-4 flex-row items-center gap-3"
    >
      <View
        className="h-6 w-6 items-center justify-center rounded-full border-2"
        style={{ borderColor: selected ? editorial.secondary : editorial.outline }}
      >
        {selected ? (
          <View className="h-3 w-3 rounded-full" style={{ backgroundColor: editorial.secondary }} />
        ) : null}
      </View>
      <Text className="font-inter text-body-sm text-ed-on-surface">{label}</Text>
    </Pressable>
  );
}

function WeddingDateModal({
  visible,
  weddingDate,
  onClose,
}: {
  visible: boolean;
  weddingDate: Date | null;
  onClose: () => void;
}) {
  const { editorial } = useTheme();
  const saveDate = useSetWeddingDate();
  const [value, setValue] = useState('');

  // Re-seed from the stored date each time the sheet opens, so cancelling
  // and reopening never shows a stale edit.
  useEffect(() => {
    if (!visible) return;
    setValue(weddingDate ? isoDateInput(weddingDate) : '');
  }, [visible, weddingDate]);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      Alert.alert('Check the date', 'Please enter it as YYYY-MM-DD, for example 2027-07-18.');
      return;
    }
    const parsed = trimmed === '' ? null : new Date(`${trimmed}T00:00:00`);
    if (parsed && Number.isNaN(parsed.getTime())) {
      Alert.alert('Check the date', 'That is not a real date.');
      return;
    }
    saveDate.mutate(trimmed === '' ? null : trimmed, {
      onSuccess: onClose,
      onError: (error) =>
        Alert.alert(
          "Couldn't save your date",
          getErrorMessage(error, 'Please try again shortly.'),
        ),
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-ed-bg">
        <View className="flex-row items-center justify-between border-b border-ed-outline-variant px-5 py-4">
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text className="font-inter text-body-sm text-ed-on-surface">Cancel</Text>
          </Pressable>
          <Text className="font-inter-bold text-body text-ed-on-surface">Wedding date</Text>
          <View style={{ width: 52 }} />
        </View>

        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8 pt-6" keyboardShouldPersistTaps="handled">
            <Text className="font-inter text-body-sm leading-5 text-ed-on-surface-variant">
              Every task&rsquo;s due date is worked out from this, so setting it turns on the month
              view and your reminders.
            </Text>

            <Text className="mb-1.5 mt-6 font-inter-medium text-caption uppercase tracking-wide text-ed-on-surface-variant">
              Date
            </Text>
            <TextInput
              value={value}
              onChangeText={setValue}
              autoFocus
              placeholder="2027-07-18"
              placeholderTextColor={editorial.onSurfaceVariant}
              autoCapitalize="none"
              className="rounded-2xl border border-ed-outline-variant bg-ed-surface px-4 py-3.5 font-inter text-body-sm text-ed-on-surface"
            />
          </ScrollView>

          <View className="border-t border-ed-outline-variant px-5 py-4">
            <Pressable
              onPress={submit}
              disabled={saveDate.isPending}
              accessibilityRole="button"
              className="items-center rounded-full py-4"
              style={{ backgroundColor: editorial.secondary, opacity: saveDate.isPending ? 0.6 : 1 }}
            >
              {saveDate.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="font-inter-bold text-body-sm text-white">Save date</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function AddTaskModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (title: string, categoryId: string) => void;
}) {
  const { editorial } = useTheme();
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState(CHECKLIST_CATEGORIES[0].id);

  const submit = () => {
    if (title.trim() === '') return;
    onSubmit(title.trim(), categoryId);
    setTitle('');
    setCategoryId(CHECKLIST_CATEGORIES[0].id);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-ed-bg">
        <View className="flex-row items-center justify-between border-b border-ed-outline-variant px-5 py-4">
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text className="font-inter text-body-sm text-ed-on-surface">Cancel</Text>
          </Pressable>
          <Text className="font-inter-bold text-body text-ed-on-surface">New task</Text>
          <View style={{ width: 52 }} />
        </View>

        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8 pt-5" keyboardShouldPersistTaps="handled">
            <Text className="mb-1.5 font-inter-medium text-caption uppercase tracking-wide text-ed-on-surface-variant">
              Task
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              autoFocus
              placeholder="Confirm the decorator"
              placeholderTextColor={editorial.onSurfaceVariant}
              className="rounded-2xl border border-ed-outline-variant bg-ed-surface px-4 py-3.5 font-inter text-body-sm text-ed-on-surface"
            />

            <Text className="mb-2 mt-5 font-inter-medium text-caption uppercase tracking-wide text-ed-on-surface-variant">
              Category
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {CHECKLIST_CATEGORIES.map((category) => {
                const active = category.id === categoryId;
                return (
                  <Pressable
                    key={category.id}
                    onPress={() => setCategoryId(category.id)}
                    className="rounded-full px-3.5 py-2"
                    style={{
                      backgroundColor: active ? editorial.secondary : editorial.surfaceContainer,
                    }}
                  >
                    <Text
                      className="font-inter-semibold text-caption"
                      style={{ color: active ? '#FFFFFF' : editorial.onSurfaceVariant }}
                    >
                      {category.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View className="border-t border-ed-outline-variant px-5 py-4">
            <Pressable
              onPress={submit}
              disabled={title.trim() === ''}
              accessibilityRole="button"
              className="items-center rounded-full py-4"
              style={{
                backgroundColor: editorial.secondary,
                opacity: title.trim() === '' ? 0.5 : 1,
              }}
            >
              <Text className="font-inter-bold text-body-sm text-white">Add task</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
