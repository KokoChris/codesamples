import $ from 'jquery-1.x';
import _ from 'underscore.global';
import React from 'react';
import Megatron from 'backbone.react-bridge';
import ListView from './list';
import LayoutView from './layout';
import SuggestedCandidates from './suggestedCandidates';
import {listTypes} from '../constants';
import {fetchCandidate} from '../helpers';
import PendingCandidatesPoller from '../components/pendingCandidatesPoller';
import {isActive as isSCActive} from './suggestedCandidates/helpers';

const App = global.Workable;
const h = App.helpers;

/**
 * List.Controller
 * ---------------
 *
 * the controller driving the candidate list
 *
 */

export default App.ViewController.extend({
  initialize() {
    _.bindAll(this, 'render', 'show', 'adjustListsHeight', 'scrollToCurrentCandidate', '_keepListScrollable');

    this.listenTo(App.channel, 'candidate:shown', this.markCandidateAsRead);
    this.listenTo(App.channel, 'tag:clicked', this.appendTagToFilter);
    this.listenTo(App.channel, 'bulk:close', this.onBulkClose);

    this.listenTo(App.channel, 'candidate:remove', this.adjustListsHeight);
    this.listenTo(App.channel, 'candidate:add', this.adjustListsHeight);
    this.listenTo(App.channel, 'candidate:shown', this.adjustListsHeight);

    this._adjustListsHeightOnResize();
  },

  show(stage, candidate, opts = {}) {
    this._setStage(stage);
    this._setupPendingCandidatesPoller();
    this._buildView();

    this.render();

    if (candidate) {
      this.setCurrentCandidate(candidate);
    }

    if (opts.listsDfd && opts.listsDfd.activeList) {
      this.getActiveTabView().showSkeletonLoader(opts.listsDfd.activeList);
    }

    this._bindViewEvents();
  },

  render() {
    this.region.show(this.view);
    this.view.qualified.show(this.qualifiedView);
    this.view.disqualified.show(this.disqualifiedView);
    this.view.suggestedCandidates.show(this.suggestedCandidates);
    this.triggerMethod('render');
  },

  onRender() {
    _.defer(
      function () {
        this.adjustListsHeight();
        this._keepListScrollable(); // should be executed after the height has been adjusted
      }.bind(this)
    );
    _.delay(this.scrollToCurrentCandidate, 20); // Introduce a delay here so that we actually get to scroll
  },

  getActiveTabView() {
    return this.view.getActiveView();
  },

  getActiveList() {
    return this.stage.getActiveList();
  },

  scrollToCurrentCandidate() {
    this.getActiveTabView().scrollToCurrentCandidate();
  },

  onClose() {
    if (this.pendingCandidatesPoller) {
      this.pendingCandidatesPoller.close();
    }

    if (this._keepListScrollableTimer) {
      clearTimeout(this._keepListScrollableTimer);
    }

    this.$resizeEl.off('resize', this._debouncedAdjustListsHeight);
  },

  showCandidate(candidate, options = {}) {
    if (candidate) {
      this.getActiveList().setCurrentCandidate(candidate);
    } else {
      candidate = this.getActiveList().getCurrentCandidate();
    }

    App.channel.command('candidate:show', candidate, options);
  },

  setCurrentCandidate(candidate) {
    if (this.qualifiedList.get(candidate)) {
      this.showTab(listTypes.QUALIFIED);
      this.stage.setActiveList(listTypes.QUALIFIED);
      this.qualifiedList.setCurrentCandidate(candidate);
    } else if (this.disqualifiedList.get(candidate)) {
      this.showTab(listTypes.DISQUALIFIED);
      this.stage.setActiveList(listTypes.DISQUALIFIED);
      this.disqualifiedList.setCurrentCandidate(candidate);
    }
  },

  showTab(tab) {
    return tab === listTypes.DISQUALIFIED ? this.view.showDisqualified() : this.view.showQualified();
  },

  onTabShown(tab) {
    this.stage.setActiveList(tab);

    if (!this.stage.inBulk) {
      if (this.stage.getActiveList().isEmpty()) {
        const dfd = this.stage.model.loadActiveList();
        this.getActiveTabView().showSkeletonLoader(dfd);
      }

      const candidate = this.getActiveList().getCurrentCandidate() || this.getActiveList().first();

      if (candidate) {
        this.showCandidate(candidate);
      } else {
        const stage = this.getActiveList().stage;
        fetchCandidate(null, stage).then(candidateModel => {
          this.showCandidate(candidateModel, {skipFetchIfDataComplete: true});
        });
      }
    }
  },

  onItemClicked(item) {
    if (!this.stage.inBulk) {
      this.showCandidate(item.model);
    }
  },

  onBulkCopy() {
    this.unmarkCandidates();
    App.channel.command('bulk:copy');
  },

  onBulkVideoInterview() {
    this.unmarkCandidates();
    App.channel.command('bulk:videoInterview');
  },

  onBulkAssessment() {
    this.unmarkCandidates();
    App.channel.command('bulk:assessment');
  },

  onBulkMessage() {
    this.unmarkCandidates();
    App.channel.command('bulk:message');
  },

  onBulkDisqualify() {
    this.unmarkCandidates();
    App.channel.command('bulk:disqualify');
  },

  onBulkRevert() {
    this.unmarkCandidates();
    App.channel.command('bulk:revert');
    this.adjustListsHeight();
  },

  onBulkMove() {
    this.unmarkCandidates();
    App.channel.command('bulk:move');
    this.adjustListsHeight();
  },

  onBulkDelete() {
    this.unmarkCandidates();
    App.channel.command('bulk:delete');
    this.adjustListsHeight();
  },

  onBulkClose() {
    this.view.getQualifiedView().toggleBulkLink();
    this.view.getDisqualifiedView().toggleBulkLink();
    this.adjustListsHeight();
  },

  onChangeBucketPermissions() {
    this.qualifiedView.render();
    this.disqualifiedView.render();
    this.adjustListsHeight();
  },

  unmarkCandidates() {
    this.view.getQualifiedView().unmarkCurrentCandidate();
    this.view.getDisqualifiedView().unmarkCurrentCandidate();
  },

  refresh() {
    if (this.qualifiedView) {
      this.qualifiedView.loadData();
    }
    if (this.disqualifiedView) {
      this.disqualifiedView.loadData();
    }
  },

  refreshListData(opts) {
    if (this.qualifiedView) {
      this.qualifiedView.refreshData(opts);
    }
    if (this.disqualifiedView) {
      this.disqualifiedView.refreshData(opts);
    }
  },

  markCandidateAsRead(candidate) {
    const candidateInList = this._findCandidateInList(candidate);

    if (candidateInList) {
      candidateInList.set('unread', false);
    }
  },

  appendTagToFilter(tag) {
    const $filterInput = this.getActiveTabView().ui.filterInput;
    const query = $filterInput.val().split(' ');

    query.push(tag);
    const queryTxt = _.uniq(query)
      .join(' ')
      .trim();

    $filterInput.val(queryTxt).trigger('input');
    $filterInput.closest('.js-filtering').effect('highlight', {color: '#fffad8', duration: 1000});
  },

  adjustListsHeight() {
    let height;

    if (!this.view || this.view.$el.length === 0) {
      return;
    }

    height = $(window).height();
    height = height - this.view.$el.offsetParent().position().top;
    height = height - 23; // padding + border
    height = height - 30; // header
    if (isSCActive() && this.stage.get('slug') === 'sourced') {
      height = height - 51; // suggested-candidates collapsed
    }

    const qualifiedViewHeight = this._adjustListHeightForOptionalElements(height, this.stage.getQualifiedList());
    const disqualifiedViewHeight = this._adjustListHeightForOptionalElements(height, this.stage.getDisqualifiedList());

    this.qualifiedView.ui.body.height(qualifiedViewHeight);
    this.disqualifiedView.ui.body.height(disqualifiedViewHeight);
  },

  _adjustListHeightForOptionalElements(height, list) {
    if (list.length > 0 || list.hasQuery()) {
      height = height - 33; // filtering
    }

    if (
      this.stage
        .getPipeline()
        .getBucket()
        .canPerformBulk() &&
      list.length > 0
    ) {
      height = height - this.view.ui.header.outerHeight();
    }

    if (list.length === 0) {
      return height - 29; // height of empty list text
    }

    return height;
  },

  _setupPendingCandidatesPoller() {
    if (this.pendingCandidatesPoller) {
      this.pendingCandidatesPoller.close();
    }

    this.pendingCandidatesPoller = new PendingCandidatesPoller({stage: this.stage});
    this.pendingCandidatesPoller.schedule();
  },

  _findCandidateInList(candidate) {
    return this.qualifiedList.get(h.extractId(candidate)) || this.disqualifiedList.get(h.extractId(candidate));
  },

  _setStage(stage) {
    if (this.qualifiedList) {
      this.stopListening(this.qualifiedList);
    }
    if (this.disqualifiedList) {
      this.stopListening(this.disqualifiedList);
    }

    this.stage = stage;
    this.qualifiedList = stage.getQualifiedList();
    this.disqualifiedList = stage.getDisqualifiedList();
  },

  _buildView() {
    this.qualifiedView = new ListView({
      collection: this.qualifiedList,
      model: this.stage,
      type: 'qualified'
    });

    this.disqualifiedView = new ListView({
      collection: this.disqualifiedList,
      model: this.stage,
      type: 'disqualified'
    });

    // Since we need to listen to model events inside the SuggestedCandidates component
    // we need to pass through the props a model.
    // Somehow mutations or event propagations clogs are affecting the counter increments.
    // We can always pass through a deep copied model.
    const suggestedCandidatesModel = this.stage.deepClone();
    this.suggestedCandidates = Megatron.viewFromComponent(
      <SuggestedCandidates
        jobId={suggestedCandidatesModel && suggestedCandidatesModel.get('job_id')}
        refreshList={opts => this.refreshListData(opts)}
      />,
      {
        model: suggestedCandidatesModel,
        observe: {
          model: 'candidate:change:source'
        }
      }
    );

    this.view = new LayoutView({
      model: this.stage,
      qualifiedList: this.qualifiedList,
      disqualifiedList: this.disqualifiedList
    });

    this.view.fwd(this.qualifiedView, {prefix: 'qualified'});
    this.view.fwd(this.disqualifiedView, {prefix: 'disqualified'});
  },

  _bindViewEvents() {
    this._unbindViewEvents();

    this.listenTo(this.view, 'tab:shown', function (tab) {
      this.triggerMethod('tab:shown', tab);
    });

    this.listenTo(this.view, 'qualified:itemview:clicked disqualified:itemview:clicked', function (item) {
      this.triggerMethod('item:clicked', item);
    });

    this.listenTo(this.view, 'qualified:bulk:message disqualified:bulk:message', function () {
      this.triggerMethod('bulk:message');
    });

    this.listenTo(this.view, 'qualified:bulk:videoInterview disqualified:bulk:videoInterview', function () {
      this.triggerMethod('bulk:videoInterview');
    });

    this.listenTo(this.view, 'qualified:bulk:assessment disqualified:bulk:assessment', function () {
      this.triggerMethod('bulk:assessment');
    });

    this.listenTo(this.view, 'qualified:bulk:copy disqualified:bulk:copy', function () {
      this.triggerMethod('bulk:copy');
    });

    this.listenTo(this.view, 'qualified:bulk:move', function () {
      this.triggerMethod('bulk:move');
    });

    this.listenTo(this.view, 'qualified:bulk:disqualify', function () {
      this.triggerMethod('bulk:disqualify');
    });

    this.listenTo(this.view, 'qualified:bulk:delete disqualified:bulk:delete', function () {
      this.triggerMethod('bulk:delete');
    });

    this.listenTo(this.view, 'disqualified:bulk:revert', function () {
      this.triggerMethod('bulk:revert');
    });

    this.listenTo(this.stage.getPipeline().getBucket(), 'change:permissions', () => {
      this.triggerMethod('change:bucketPermissions');
    });
  },

  _unbindViewEvents() {
    if (this.view) {
      this.stopListening(this.view);
    }
  },

  _adjustListsHeightOnResize() {
    this._debouncedAdjustListsHeight = _.debounce(this.adjustListsHeight, 100);
    this.$resizeEl = $(window);
    this.$resizeEl.on('resize.ListController', this._debouncedAdjustListsHeight);
  },

  _keepListScrollable(attempt) {
    if (this.view.isClosed) {
      return;
    }

    const activeList = this.getActiveList();
    const activeView = this.getActiveTabView();
    const maxTries = App.config.Browser.list.keepListScrollableMaxTries || 3;
    const nextFn = _attempt => {
      this._keepListScrollable(_attempt);
    };

    attempt = attempt || 1;

    if (attempt > maxTries) {
      if (attempt === maxTries + 1) {
        this.listenToOnce(activeList, 'sync', nextFn);
      }

      return;
    }

    const scheduleNext = _attempt => {
      if (this._keepListScrollableTimer) {
        clearTimeout(this._keepListScrollableTimer);
      }
      this._keepListScrollableTimer = _.delay(nextFn, 1000, _attempt);
    };

    if (!this.view || this.view.$el.length === 0) {
      scheduleNext();
      return;
    }

    if (activeList.isSyncing() || !activeList.hasMore() || activeView.hasScrollBar()) {
      scheduleNext();
      return;
    }

    activeView
      .loadNextPage()
      .done(response => {
        if (_.isEmpty(response.data)) {
          this.listenToOnce(activeList, 'sync', nextFn);
        } else {
          scheduleNext(attempt + 1);
        }
      })
      .fail(error => {
        if (error === 'busy') {
          scheduleNext();
        } else {
          scheduleNext(attempt + 1);
        }
      });
  }
});